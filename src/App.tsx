import React, { useState, useEffect } from 'react';
import { Upload, Film, Wand2, Download, AlertCircle, CheckCircle2, RotateCcw, Lightbulb, FileJson, Share2, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { uploadClips, startRender, getJobStatus, analyzeJob } from './services/api.ts';
import { JobStatus, MontagePlan, PromptResponse } from './types.ts';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('Cinematic UGC ad for a premium coffee brand, highlighting morning routine, golden hour lighting, fast cuts');
  const [mode, setMode] = useState<'PROMPT' | 'MONTAGE'>('MONTAGE');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Poll for status when rendering
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (jobId && (status?.status === 'rendering' || status?.status === 'analyzing')) {
      interval = setInterval(async () => {
        try {
          const currentStatus = await getJobStatus(jobId);
          setStatus(currentStatus);
          if (currentStatus.status === 'completed' || currentStatus.status === 'failed') {
            clearInterval(interval);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, status]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      if (selectedFiles.length + files.length > 4) {
        setError('Exactly 4 clips are required');
        return;
      }
      setFiles([...files, ...selectedFiles]);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (files.length !== 4) {
      setError('Please upload exactly 4 clips');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Upload
      setStatus({ id: 'temp', status: 'uploading', progress: 50, mode });
      const { jobId: newJobId, clips } = await uploadClips(files);
      setJobId(newJobId);
      
      // 2. Analyze (Gemini call on BACKEND)
      setStatus({ id: newJobId, status: 'analyzing', progress: 0, mode });
      const creativeOutput = await analyzeJob(newJobId, prompt, mode);
      
      if (mode === 'PROMPT') {
        setStatus({
          id: newJobId,
          status: 'completed',
          progress: 100,
          mode,
          promptResponse: creativeOutput as PromptResponse
        });
        setLoading(false);
      } else {
        // 3. Render
        const montagePlan = creativeOutput as MontagePlan;
        await startRender(newJobId, montagePlan);
        setStatus({ 
          id: newJobId, 
          status: 'rendering', 
          progress: 0, 
          mode, 
          montagePlan 
        });
      }
    } catch (err: any) {
      setError(err.message || 'Workflow failed');
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetAll = () => {
    setFiles([]);
    setJobId(null);
    setStatus(null);
    setLoading(false);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-[#F27D26] selection:text-white pb-24">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] p-6 flex justify-between items-center bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#F27D26] rounded-lg flex items-center justify-center">
            <Film className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">OR STUDIO AI</h1>
            <p className="text-xs text-[#8E9299] font-mono uppercase tracking-widest">Creative Director v2.0</p>
          </div>
        </div>
        {jobId && (
          <button 
            onClick={resetAll}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[#8E9299] hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}
      </header>

      <main className="max-w-5xl mx-auto p-8 pt-12 space-y-12">
        <AnimatePresence mode="wait">
          {!jobId ? (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Mode Selector */}
              <div className="flex justify-center">
                <div className="bg-[#151619] p-1 rounded-xl border border-[#1a1a1a] flex">
                  <button 
                    onClick={() => setMode('MONTAGE')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${mode === 'MONTAGE' ? 'bg-[#F27D26] text-white' : 'text-[#8E9299] hover:text-white'}`}
                  >
                    <Film className="w-4 h-4" />
                    MONTAGE
                  </button>
                  <button 
                    onClick={() => setMode('PROMPT')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${mode === 'PROMPT' ? 'bg-[#F27D26] text-white' : 'text-[#8E9299] hover:text-white'}`}
                  >
                    <Lightbulb className="w-4 h-4" />
                    PROMPT
                  </button>
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-4">
                <h2 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[0.9]">
                  {mode === 'MONTAGE' ? 'THE EDITING' : 'THE VISION'} <br />
                  <span className="text-[#F27D26]">{mode === 'MONTAGE' ? 'AUTOMATED.' : 'ARCHITECTED.'}</span>
                </h2>
                <p className="text-[#8E9299] max-w-xl mx-auto">
                  {mode === 'MONTAGE' 
                    ? 'Upload your footage and let Or Studio render a cinematic advertising montage using our deterministic FFmpeg engine.' 
                    : 'Transform your raw footage into high-fidelity cinematic prompts for Veo, Sora, or other generative video systems.'}
                </p>
              </div>

              {/* Upload & Prompt Area */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Clips Column */}
                <div className="lg:col-span-3 space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-mono uppercase tracking-widest text-[#8E9299]">Media Assets (4 MP4s)</label>
                    <span className="text-xs font-mono text-[#F27D26]">{files.length}/4</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="aspect-video relative group">
                        {files[i] ? (
                          <div className="w-full h-full rounded-xl overflow-hidden bg-[#151619] border border-[#1a1a1a] relative">
                            <video 
                              src={URL.createObjectURL(files[i])} 
                              className="w-full h-full object-cover opacity-60"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[10px] font-mono bg-black/50 px-2 py-1 rounded truncate max-w-[80%]">
                                {files[i].name}
                              </span>
                            </div>
                            <button 
                              onClick={() => removeFile(i)}
                              className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <span className="text-xl leading-none">&times;</span>
                            </button>
                          </div>
                        ) : (
                          <label className="w-full h-full rounded-xl border-2 border-dashed border-[#1a1a1a] hover:border-[#F27D26] hover:bg-[#F27D26]/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group">
                            <Upload className="w-6 h-6 text-[#1a1a1a] group-hover:text-[#F27D26]" />
                            <input type="file" accept="video/mp4" className="hidden" onChange={handleFileChange} />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Director Column */}
                <div className="lg:col-span-2 space-y-4 flex flex-col">
                  <label className="text-xs font-mono uppercase tracking-widest text-[#8E9299]">Creative Direction</label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the aesthetic, hook, or mood..."
                    className="flex-1 bg-[#151619] border border-[#1a1a1a] rounded-xl p-6 text-sm font-mono focus:outline-none focus:border-[#F27D26] resize-none leading-relaxed"
                  />
                  <button 
                    onClick={handleGenerate}
                    disabled={loading || files.length !== 4}
                    className="w-full h-20 bg-[#F27D26] hover:bg-[#f38a3d] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl flex flex-col items-center justify-center transition-all shadow-xl shadow-[#F27D26]/10 group"
                  >
                    {loading ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                        <RotateCcw className="w-6 h-6" />
                      </motion.div>
                    ) : (
                      <>
                        <span className="text-lg font-bold tracking-tight group-active:scale-95">EXECUTE {mode}</span>
                        <span className="text-[10px] font-mono tracking-widest opacity-60">Initializing workflow core</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-500 font-mono text-xs italic">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  {error}
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="output"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Workflow Status Header */}
              <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl p-8 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="space-y-2 text-center md:text-left">
                  <h3 className="text-xs font-mono uppercase tracking-[0.3em] text-[#8E9299]">{mode} WORKFLOW ACTIVE</h3>
                  <p className="text-3xl font-bold uppercase tracking-tight">
                    {status?.status === 'uploading' && 'Ingesting Raw Media'}
                    {status?.status === 'analyzing' && 'Creative Cognitive Analysis'}
                    {status?.status === 'rendering' && 'FFmpeg Core Synthesis'}
                    {status?.status === 'completed' && 'Production Ready'}
                    {status?.status === 'failed' && 'Critical Workflow Failure'}
                  </p>
                </div>
                <div className="flex items-center gap-6">
                  {status?.status !== 'completed' && status?.status !== 'failed' && (
                    <div className="w-16 h-16 rounded-full border-4 border-[#1a1a1a] border-t-[#F27D26] animate-spin" />
                  )}
                  {status?.status === 'completed' && <CheckCircle2 className="w-16 h-16 text-green-500" />}
                  {status?.status === 'failed' && <AlertCircle className="w-16 h-16 text-red-500" />}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[#F27D26]"
                  initial={{ width: 0 }}
                  animate={{ width: `${status?.progress || 0}%` }}
                />
              </div>

              {/* MODE A: Prompt Generation Result */}
              {mode === 'PROMPT' && status?.promptResponse && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl overflow-hidden">
                      <div className="p-4 bg-[#0a0a0a] border-b border-[#1a1a1a] flex justify-between items-center">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[#8E9299]">GENERATED CINEMATIC PROMPT</span>
                        <button 
                          onClick={() => copyToClipboard(status.promptResponse!.prompt)}
                          className="text-[#F27D26] hover:text-white transition-colors"
                        >
                          {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="p-8">
                        <p className="text-xl font-medium leading-relaxed font-serif italic text-[#E4E3E0]">
                          "{status.promptResponse.prompt}"
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl p-6 space-y-4">
                      <h4 className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest">Applied Creative Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {status.promptResponse.applied_skills.map((skill, i) => (
                          <span key={i} className="px-3 py-1 bg-[#F27D26]/10 text-[#F27D26] rounded-full text-[10px] font-mono border border-[#F27D26]/20">
                            {skill.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl p-6 space-y-4">
                      <h4 className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest">Visual Summary</h4>
                      <div className="space-y-3">
                        {Object.entries(status.promptResponse.visual_summary).map(([key, value]) => (
                          <div key={key} className="space-y-1">
                            <p className="text-[9px] uppercase text-[#8E9299]">{key.replace('_', ' ')}</p>
                            <p className="text-xs font-bold">{value as string}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-[#F27D26]/10 border border-[#F27D26]/20 rounded-2xl p-6 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase text-[#F27D26]">Confidence</p>
                        <p className="text-xl font-bold tracking-tighter">{(status.promptResponse.confidence * 100).toFixed(0)}%</p>
                      </div>
                      <Wand2 className="w-8 h-8 text-[#F27D26]" />
                    </div>
                  </div>
                </div>
              )}

              {/* MODE B: Montage Result */}
              {mode === 'MONTAGE' && status?.status === 'completed' && status.outputUrl && (
                <div className="space-y-8">
                  <div className="aspect-[9/16] max-w-[320px] mx-auto bg-black rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(242,125,38,0.15)] ring-1 ring-[#1a1a1a] relative group">
                    <video src={status.outputUrl} controls className="w-full h-full object-cover" autoPlay />
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto">
                    <a href={status.outputUrl} download className="flex-1 h-16 bg-white text-black rounded-xl flex items-center justify-center gap-3 font-bold hover:scale-[1.02] active:scale-95 transition-all">
                      <Download className="w-5 h-5" />
                      DOWNLOAD 1080P
                    </a>
                    <button onClick={resetAll} className="flex-1 h-16 bg-[#151619] border border-[#1a1a1a] rounded-xl flex items-center justify-center gap-3 font-mono text-xs uppercase tracking-widest hover:bg-[#1a1a1a] transition-all">
                      <RotateCcw className="w-4 h-4" />
                      NEW PROJECT
                    </button>
                  </div>
                </div>
              )}

              {/* Montage Analysis Data */}
              {mode === 'MONTAGE' && status?.montagePlan && (
                <div className="space-y-6">
                  <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl p-6 space-y-4">
                    <h4 className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest">Applied Montage Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {status.montagePlan.applied_skills.map((skill, i) => (
                        <span key={i} className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-[10px] font-mono border border-blue-500/20">
                          {skill.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {status.montagePlan.clip_analysis.map((analysis, i) => (
                      <div key={i} className="bg-[#151619] border border-[#1a1a1a] rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono text-[#F27D26]">{analysis.clip_id}</span>
                          <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${analysis.recommended_role === 'hook' ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500'}`}>
                            {analysis.recommended_role.toUpperCase()}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[8px] uppercase text-[#8E9299]">
                            <span>Hook Strength</span>
                            <span>{analysis.hook_value}%</span>
                          </div>
                          <div className="h-0.5 bg-black rounded-full overflow-hidden">
                            <div className="h-full bg-[#F27D26]" style={{ width: `${analysis.hook_value}%` }} />
                          </div>
                          <div className="flex justify-between text-[8px] uppercase text-[#8E9299]">
                            <span>Product Focus</span>
                            <span>{analysis.product_focus}%</span>
                          </div>
                          <div className="h-0.5 bg-black rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${analysis.product_focus}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#151619] border border-[#1a1a1a] rounded-2xl p-6 space-y-4">
                    <h4 className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest">Director's Editing Notes</h4>
                    <ul className="space-y-2">
                       {status.montagePlan.editing_notes.map((note, i) => (
                         <li key={i} className="text-xs font-mono text-[#8E9299] flex gap-3">
                            <span className="text-[#F27D26]">›</span>
                            {note}
                         </li>
                       ))}
                    </ul>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Ambiance */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#F27D26]/5 blur-[100px] -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-blue-500/5 blur-[100px] translate-y-1/2 -translate-x-1/2" />
      </div>

      <footer className="fixed bottom-0 w-full p-6 border-t border-[#1a1a1a] bg-[#0a0a0a]/90 backdrop-blur-md flex justify-center items-center gap-8 text-[9px] font-mono uppercase tracking-[0.4em] text-[#333] z-50">
        <span>CORE VERSION 2.1.2</span>
        <span>GEOMETRIC ENGINE ACTIVE</span>
        <span>LATENCY OPTIMIZED</span>
      </footer>
    </div>
  );
}
