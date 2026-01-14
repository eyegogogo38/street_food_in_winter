
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import JSZip from 'jszip';
import { 
  Loader2, Download, Zap, Mic, Image as ImageIcon, FileText, AlertCircle, Sparkles, Check, 
  Archive, ArrowRight, Play, RotateCcw, Edit2, X, ChevronRight, Layers, Cpu, Settings2, 
  Maximize2, Palette, Music, Video, Pause, Volume2, Search
} from 'lucide-react';
import { ShortsScript, GenerationStatus, Scene } from './types';
import { decodeBase64ToUint8Array, wrapPcmInWav } from './utils/audioHelper';

const STYLES = [
  "Photorealistic", "3D Animation", "Impressionism", "Cubism", "Realism", "Surrealism", "Paper Art", "Minimalism", 
  "Pixel Art", "Cartoon", "Art Deco", "Pop Art", "Sci-Fi Fantasy", "Flat Design", "Isometric", "Watercolor", 
  "Sketch", "Van Gogh Style", "Monet Style"
];

const RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4"];

const App: React.FC = () => {
  const [topic, setTopic] = useState<string>("겨울철 별미 (Winter Street Food)");
  const [imageCount, setImageCount] = useState<string>("5");
  const [aspectRatio, setAspectRatio] = useState<string>("9:16");
  const [selectedStyle, setSelectedStyle] = useState<string>("Photorealistic");
  const [customStyle, setCustomStyle] = useState<string>("");

  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<ShortsScript | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<(string | null)[]>([]); 
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  
  const [imageGeneratingIndex, setImageGeneratingIndex] = useState<number | null>(null);
  const [videoGeneratingIndex, setVideoGeneratingIndex] = useState<number | null>(null);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);

  const isProcessing = [
    GenerationStatus.SCRIPT_GENERATING,
    GenerationStatus.IMAGES_GENERATING,
    GenerationStatus.AUDIO_GENERATING,
    GenerationStatus.VIDEO_GENERATING,
    GenerationStatus.ZIPPING
  ].includes(status) || videoGeneratingIndex !== null || imageGeneratingIndex !== null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getStatusLabel = (s: GenerationStatus) => {
    switch (s) {
      case GenerationStatus.SCRIPT_GENERATING: return "DRAFTING SCRIPT...";
      case GenerationStatus.SCRIPT_REVIEW: return "SCRIPT REVIEW";
      case GenerationStatus.IMAGES_GENERATING: return "RENDERING VISUALS...";
      case GenerationStatus.AUDIO_GENERATING: return "SYNTHESIZING VOICE...";
      case GenerationStatus.VIDEO_GENERATING: return "GENERATING MOTION (VEO)...";
      case GenerationStatus.ZIPPING: return "PACKAGING ASSETS...";
      case GenerationStatus.COMPLETED: return "PRODUCTION READY";
      case GenerationStatus.ERROR: return "SYSTEM HALTED";
      default: return "SYSTEM READY";
    }
  };

  const generateScriptDraft = async () => {
    if (!topic.trim()) {
      setError("Please enter a topic.");
      return;
    }

    try {
      setError(null);
      setScript(null);
      setImages([]);
      setVideos([]);
      setAudioUrl(null);
      setZipBlob(null);
      setStatus(GenerationStatus.SCRIPT_GENERATING);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const finalStyle = customStyle.trim() || selectedStyle;
      const countNum = imageCount === "Auto" ? "5" : imageCount;

      const scriptResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create a professional 30-second YouTube Shorts script about '${topic}'. 
        
        CRITICAL INSTRUCTIONS:
        1. Break the content into exactly ${countNum} logical scenes.
        2. For EACH scene, provide:
           - 'text': A short, punchy sentence IN KOREAN to be narrated.
           - 'imagePrompt': A technical and descriptive visual prompt IN ENGLISH following the '${finalStyle}' style.
        3. CULTURAL & AESTHETIC ACCURACY:
           - MONEY: If 1,000 Won is shown, describe it accurately as: "A crisp blue South Korean 1,000 Won bank note with a portrait of philosopher Yi Hwang on the front, Bank of Korea markings, specific blue and white color palette, photorealistic detail."
           - DECOR: AVOID Japanese-style lamps, furniture, or shoji screens. Use modern, ordinary, or contemporary global minimalist decor for any interior scenes.
           - FOOD: Ensure street food looks authentic to the '${topic}' context.
        4. The total script should be roughly 30 seconds when narrated.
        5. Provide 1 BGM description for the entire video.
        
        Respond in JSON format only.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    imagePrompt: { type: Type.STRING }
                  },
                  required: ["text", "imagePrompt"]
                }
              },
              bgmPrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["title", "scenes", "bgmPrompts"]
          }
        }
      });

      const scriptData: ShortsScript = JSON.parse(scriptResponse.text || '{}');
      if (!scriptData.bgmPrompts || scriptData.bgmPrompts.length === 0) {
        scriptData.bgmPrompts = ["Cinematic, ambient, upbeat background music matching the theme."];
      }
      
      setScript(scriptData);
      setImages(new Array(scriptData.scenes.length).fill(''));
      setVideos(new Array(scriptData.scenes.length).fill(null));
      setStatus(GenerationStatus.SCRIPT_REVIEW);

    } catch (err: any) {
      setError(err.message || "Script generation failed.");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const generateAudio = async () => {
    if (!script) return;
    try {
      setStatus(GenerationStatus.AUDIO_GENERATING);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const fullText = script.scenes.map(s => s.text).join(". ");
      
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `세련되고 활기찬 한국어 목소리로 낭독: ${fullText}` }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) throw new Error("Voice synthesis failed.");

      const pcmData = decodeBase64ToUint8Array(audioBase64);
      const wavBlob = wrapPcmInWav(pcmData);
      setAudioBlob(wavBlob);
      const url = URL.createObjectURL(wavBlob);
      setAudioUrl(url);
      setStatus(GenerationStatus.SCRIPT_REVIEW);
    } catch (err: any) {
      setError(err.message || "Audio synthesis error.");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const generateSingleImage = async (index: number) => {
    if (!script || !script.scenes[index].imagePrompt) return;
    try {
      setImageGeneratingIndex(index);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imgResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: script.scenes[index].imagePrompt }] },
        config: { imageConfig: { aspectRatio: aspectRatio as any } }
      });
      const part = imgResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        setImages(prev => {
          const updated = [...prev];
          updated[index] = part.inlineData!.data;
          return updated;
        });
      }
    } catch (err: any) {
      setError(`Scene ${index + 1} rendering failed.`);
    } finally {
      setImageGeneratingIndex(null);
    }
  };

  const generateSingleVideo = async (index: number) => {
    if (!script || !images[index]) return;
    try {
      setVideoGeneratingIndex(index);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: script.scenes[index].imagePrompt,
        image: {
          imageBytes: images[index],
          mimeType: 'image/png',
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: aspectRatio as any
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const videoBlob = await videoRes.blob();
        const videoUrl = URL.createObjectURL(videoBlob);
        setVideos(prev => {
          const updated = [...prev];
          updated[index] = videoUrl;
          return updated;
        });
      }
    } catch (err: any) {
      setError(`Scene ${index + 1} video generation failed.`);
    } finally {
      setVideoGeneratingIndex(null);
    }
  };

  const generateAllAssets = async () => {
    if (!script) return;
    try {
      setError(null);
      setStatus(GenerationStatus.IMAGES_GENERATING);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      for (let i = 0; i < script.scenes.length; i++) {
        setImageGeneratingIndex(i);
        const imgResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: script.scenes[i].imagePrompt }] },
          config: { imageConfig: { aspectRatio: aspectRatio as any } }
        });
        const part = imgResponse.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          const data = part.inlineData.data;
          setImages(prev => {
            const updated = [...prev];
            updated[i] = data;
            return updated;
          });
        }
      }
      setImageGeneratingIndex(null);
      await generateAudio();
      setStatus(GenerationStatus.COMPLETED);
    } catch (err: any) {
      setError(err.message || "Batch asset generation failed.");
      setStatus(GenerationStatus.ERROR);
    }
  };

  const createZip = async () => {
    if (!script || !audioBlob) return;
    try {
      setStatus(GenerationStatus.ZIPPING);
      const zip = new JSZip();
      const folder = zip.folder(script.title.replace(/\s/g, '_'));
      if (folder) {
        folder.file("script.json", JSON.stringify(script, null, 2));
        folder.file("narration.wav", audioBlob);
        
        // Add images
        images.forEach((img, i) => {
          if (img) folder.file(`scene_${i+1}.png`, img, { base64: true });
        });

        // Add videos (fetch blobs from local object URLs)
        for (let i = 0; i < videos.length; i++) {
          const videoUrl = videos[i];
          if (videoUrl) {
            const response = await fetch(videoUrl);
            const videoBlob = await response.blob();
            folder.file(`scene_${i+1}.mp4`, videoBlob);
          }
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      setZipBlob(blob);
      setStatus(GenerationStatus.COMPLETED);
    } catch (err: any) {
      setError("Zipping failed.");
    }
  };

  const handleDownloadZip = useCallback(() => {
    if (!zipBlob || !script) return;
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${script.title.replace(/\s/g, '_')}_bundle.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [zipBlob, script]);

  const updateSceneText = (index: number, text: string) => {
    if (!script) return;
    const newScenes = [...script.scenes];
    newScenes[index].text = text;
    setScript({ ...script, scenes: newScenes });
  };

  const updateScenePrompt = (index: number, prompt: string) => {
    if (!script) return;
    const newScenes = [...script.scenes];
    newScenes[index].imagePrompt = prompt;
    setScript({ ...script, scenes: newScenes });
  };

  useEffect(() => {
    if (!audioRef.current) return;
    const updateTime = () => setCurrentTime(audioRef.current?.currentTime || 0);
    audioRef.current.addEventListener('timeupdate', updateTime);
    return () => audioRef.current?.removeEventListener('timeupdate', updateTime);
  }, [audioUrl]);

  const getActiveSceneIndex = () => {
    if (!audioRef.current || !script || script.scenes.length === 0) return 0;
    const duration = audioRef.current.duration || 1; 
    const sceneDuration = duration / script.scenes.length;
    return Math.min(Math.floor(currentTime / sceneDuration), script.scenes.length - 1);
  };

  const getActiveSubtitle = () => {
    if (!script || !audioRef.current || script.scenes.length === 0) return "";
    const idx = getActiveSceneIndex();
    return script.scenes[idx].text;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 font-sans flex flex-col items-center py-10 px-4 relative overflow-hidden">
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/10 blur-[150px] rounded-full pointer-events-none animate-pulse" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] bg-blue-900/10 blur-[180px] rounded-full pointer-events-none animate-pulse" />
      
      <div className="w-full max-w-6xl z-10 flex flex-col gap-10">
        
        {/* Header */}
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-5xl md:text-7xl tracking-tighter text-white select-none whitespace-nowrap">
            <span className="font-[100] opacity-30">SHORTS</span>
            <span className="font-[600] ml-2">CREATOR</span>
          </h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[1em] ml-[1em] opacity-80">
            Intelligence-Sync Motion Studio
          </p>
        </header>

        {/* Control Panel */}
        <div className="flex flex-col gap-6 bg-zinc-900/40 backdrop-blur-3xl rounded-[32px] p-8 border border-white/5 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 bg-black/40 rounded-2xl p-1.5 flex items-center border border-white/5 focus-within:border-indigo-500/50 transition-all">
              <Cpu className="text-indigo-400 mx-4 shrink-0" size={20} />
              <input 
                type="text" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={isProcessing}
                className="w-full bg-transparent border-none py-3 text-lg font-light text-white outline-none placeholder-zinc-700"
                placeholder="Describe your story idea..."
              />
              <button onClick={generateScriptDraft} disabled={isProcessing}
                className="px-6 py-3 bg-white text-black rounded-xl text-[11px] font-bold uppercase tracking-wider hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 shrink-0"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : "INIT PRODUCTION"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Settings2 size={12} /> IMAGE COUNT
              </label>
              <select value={imageCount} onChange={(e) => setImageCount(e.target.value)} disabled={isProcessing}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-zinc-400 outline-none cursor-pointer"
              >
                <option value="Auto">AUTO RECOMMEND</option>
                {[3, 4, 5, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n} SCENES</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Maximize2 size={12} /> ASPECT RATIO
              </label>
              <div className="flex gap-1.5">
                {RATIOS.map(r => (
                  <button key={r} onClick={() => setAspectRatio(r)} disabled={isProcessing}
                    className={`flex-1 py-3 text-[10px] font-bold rounded-xl border transition-all ${aspectRatio === r ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-black/20 border-white/5 text-zinc-600 hover:border-white/10'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                <Palette size={12} /> VISUAL STYLE
              </label>
              <select value={selectedStyle} onChange={(e) => setSelectedStyle(e.target.value)} disabled={isProcessing}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-zinc-400 outline-none cursor-pointer"
              >
                {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Main Production Workspace */}
        <div className="grid grid-cols-12 gap-8 items-start">
          
          {/* Left: Script Editor */}
          <div className="col-span-12 lg:col-span-7 space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl rounded-[32px] p-8 border border-white/5 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400 border border-indigo-500/20"><Layers size={20} /></div>
                  <h2 className="text-xl font-light text-white/50 tracking-tight uppercase">TIMELINE SCRIPT</h2>
                </div>
                {script && (
                  <button onClick={generateAllAssets} disabled={isProcessing}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
                  >
                    SYNC ASSETS <Zap size={12} />
                  </button>
                )}
              </div>

              {script ? (
                <div className="space-y-8 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                  {script.scenes.map((scene, i) => (
                    <div key={i} className="space-y-4 p-5 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/20 transition-all group">
                      <div className="flex items-center justify-between">
                         <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">SCENE {String(i + 1).padStart(2, '0')}</label>
                         {images[i] && (
                           <button onClick={() => generateSingleImage(i)} disabled={isProcessing} className="p-2 hover:bg-white/5 rounded-lg text-zinc-600 hover:text-indigo-400 transition-colors" title="Regenerate Image">
                             <RotateCcw size={14} className={imageGeneratingIndex === i ? 'animate-spin' : ''} />
                           </button>
                         )}
                      </div>
                      
                      <div className="space-y-2">
                        <label className="text-[8px] font-bold text-zinc-700 uppercase tracking-[0.2em] flex items-center gap-1.5"><Mic size={10}/> Narration</label>
                        <textarea 
                          value={scene.text} 
                          onChange={(e) => updateSceneText(i, e.target.value)} 
                          rows={2}
                          className="w-full bg-transparent border-none p-0 text-lg font-light text-white/70 focus:ring-0 resize-none leading-relaxed placeholder-zinc-800" 
                          placeholder="What should the voice say?"
                        />
                      </div>

                      <div className="space-y-2 pt-2 border-t border-white/5">
                        <label className="text-[8px] font-bold text-zinc-700 uppercase tracking-[0.2em] flex items-center gap-1.5"><ImageIcon size={10}/> Visual Prompt (English)</label>
                        <textarea 
                          value={scene.imagePrompt} 
                          onChange={(e) => updateScenePrompt(i, e.target.value)} 
                          rows={2}
                          className="w-full bg-black/20 rounded-xl px-3 py-2 text-[11px] font-mono text-zinc-400 focus:ring-1 focus:ring-indigo-500/50 border border-white/5 resize-none placeholder-zinc-800" 
                          placeholder="Describe the visual scene in detail..."
                        />
                      </div>
                    </div>
                  ))}
                  
                  <div className="space-y-2 pt-4 border-t border-white/5">
                    <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">GLOBAL BGM</label>
                    <div className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
                      <Music size={14} className="text-zinc-600" />
                      <input type="text" value={script.bgmPrompts[0]} onChange={(e) => {
                        const updated = [...script.bgmPrompts];
                        updated[0] = e.target.value;
                        setScript({...script, bgmPrompts: updated});
                      }} className="w-full bg-transparent border-none p-0 text-[11px] text-zinc-500 outline-none" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-24 flex flex-col items-center justify-center text-zinc-800 opacity-20">
                  <Play size={60} strokeWidth={1} />
                  <p className="text-[9px] font-bold uppercase tracking-[1em] mt-4 ml-[1em]">Awaiting Input</p>
                </div>
              )}
            </div>

            {/* Sync Preview Player */}
            <div className="bg-zinc-900/40 backdrop-blur-2xl rounded-[32px] p-8 border border-white/5 shadow-2xl relative overflow-hidden group/preview">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                  <Sparkles size={12} className="text-indigo-500" /> REAL-TIME PREVIEW
                </h3>
                <div className="flex items-center gap-2">
                  <Volume2 size={14} className="text-zinc-600" />
                  <div className="h-1 w-20 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: '70%' }} />
                  </div>
                </div>
              </div>

              <div 
                className="bg-black rounded-2xl relative shadow-2xl border border-white/5 overflow-hidden flex items-center justify-center group"
                style={{ aspectRatio: aspectRatio.replace(':', '/') }}
              >
                {videos[getActiveSceneIndex()] ? (
                  <video src={videos[getActiveSceneIndex()]!} className="w-full h-full object-cover" autoPlay loop muted />
                ) : images[getActiveSceneIndex()] ? (
                  <img src={`data:image/png;base64,${images[getActiveSceneIndex()]}`} className="w-full h-full object-cover opacity-80" />
                ) : (
                  <div className="flex flex-col items-center gap-3 opacity-20">
                    <ImageIcon size={40} />
                    <span className="text-[10px] font-bold tracking-widest uppercase">Buffer Stream</span>
                  </div>
                )}

                {/* SUBTITLE: SYNCED ONE-LINER */}
                <div className="absolute inset-x-0 bottom-10 flex justify-center px-10 z-20 pointer-events-none">
                  <div className="bg-black/70 backdrop-blur-xl border border-white/10 px-8 py-4 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-300">
                    <p className="text-white text-xl md:text-2xl font-semibold tracking-tight text-center drop-shadow-2xl leading-tight">
                      {getActiveSubtitle() || "Awaiting narration..."}
                    </p>
                  </div>
                </div>

                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                  <button onClick={() => {
                    if (audioRef.current?.paused) {
                      audioRef.current.play();
                      setIsPlaying(true);
                    } else {
                      audioRef.current?.pause();
                      setIsPlaying(false);
                    }
                  }} className="w-20 h-20 bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all">
                    {isPlaying ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
                  </button>
                </div>
              </div>

              {audioUrl && (
                <div className="mt-8 space-y-4">
                  <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const pct = x / rect.width;
                    if (audioRef.current) audioRef.current.currentTime = pct * audioRef.current.duration;
                  }}>
                    <div className="h-full bg-indigo-500 transition-all duration-100 shadow-[0_0_10px_#6366F1]" style={{ width: `${(currentTime / (audioRef.current?.duration || 1)) * 100}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                    <span className="flex items-center gap-2"><Mic size={10} /> AUDIO SYNC: ON</span>
                    <span>{currentTime.toFixed(1)}s / {(audioRef.current?.duration || 0).toFixed(1)}s</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Asset Storyboard */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            <div className="bg-zinc-900/40 backdrop-blur-2xl rounded-[32px] p-6 border border-white/5 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center"><ImageIcon size={14} className="text-zinc-500" /></div>
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">Asset Grid</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {script?.scenes.map((_, idx) => (
                  <div key={idx} className="group relative">
                    <div 
                      className="overflow-hidden rounded-2xl bg-black/60 border border-white/5 relative group-hover:border-indigo-500/50 transition-all shadow-lg"
                      style={{ aspectRatio: aspectRatio.replace(':', '/') }}
                    >
                      {images[idx] ? (
                        <img src={`data:image/png;base64,${images[idx]}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-10">
                           <div className={`w-2 h-2 rounded-full bg-white ${imageGeneratingIndex === idx ? 'animate-ping' : ''}`} />
                        </div>
                      )}
                      
                      <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
                        <button onClick={() => generateSingleVideo(idx)} disabled={!images[idx] || videoGeneratingIndex === idx}
                          className="p-3 bg-indigo-600 text-white rounded-xl shadow-2xl hover:bg-indigo-500 active:scale-90 transition-all"
                        >
                          {videoGeneratingIndex === idx ? <Loader2 className="animate-spin" size={16} /> : <Video size={16} />}
                        </button>
                      </div>

                      {videos[idx] && (
                        <div className="absolute bottom-3 left-3 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-lg text-[8px] font-bold text-green-400 uppercase backdrop-blur-md">Motion Active</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {status !== GenerationStatus.IDLE && (
                <div className="p-5 bg-zinc-900/80 border border-white/5 rounded-3xl flex items-center justify-between shadow-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">{getStatusLabel(status)}</span>
                  </div>
                  {status === GenerationStatus.COMPLETED && <button onClick={createZip} className="text-[10px] font-black text-indigo-400 hover:text-white transition-colors tracking-widest">PACKAGE ZIP</button>}
                </div>
              )}

              {zipBlob && (
                <button onClick={handleDownloadZip}
                  className="w-full bg-gradient-to-br from-indigo-700 to-indigo-500 hover:scale-[1.02] active:scale-95 transition-all rounded-[28px] p-7 text-white shadow-[0_20px_50px_rgba(99,102,241,0.2)] flex items-center justify-between border border-white/10"
                >
                  <div className="flex items-center gap-5 text-left">
                    <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center"><Download size={24} /></div>
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest">DOWNLOAD MASTER</h4>
                      <p className="text-[8px] opacity-50 font-bold mt-1 tracking-widest">PRODUCTION BUNDLE READY</p>
                    </div>
                  </div>
                  <Check size={20} className="text-white/60" />
                </button>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-12 py-10 border-t border-white/5 flex flex-col items-center gap-4 opacity-10">
           <span className="text-[10px] font-bold uppercase tracking-[2.5em] ml-[2.5em]">Frame-By-Frame Intelligence</span>
           <div className="flex gap-10 text-[8px] font-bold uppercase tracking-widest">
              <span>Scene Logic v4.4</span>
              <span>Audio Bridge v1.9</span>
              <span>Visual Engine v2.5</span>
           </div>
        </footer>
      </div>

      <style>{`
        @keyframes organic-breath {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.01); opacity: 0.35; }
        }
        .animate-organic-breath { animation: organic-breath 10s infinite ease-in-out; }
        input, textarea, select { outline: none !important; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #18181B; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        ::selection { background: #6366F1; color: white; }
      `}</style>
    </div>
  );
};

export default App;
