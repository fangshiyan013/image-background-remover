"use client";

import { useState, useCallback, useRef } from "react";

export default function Home() {
  const [original, setOriginal] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<File | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }
    fileRef.current = file;
    setOriginal(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setLoading(true);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/remove-bg", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to process image");
      }
      const blob = await res.blob();
      setResult(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const downloadResult = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "removed-bg.png";
    a.click();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center text-lg">✂️</div>
          <h1 className="text-xl font-bold">BG Remover</h1>
          <span className="ml-auto text-sm text-slate-400">Powered by remove.bg</span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4">Remove Image Background</h2>
          <p className="text-slate-400 text-lg">Upload any image and get a clean transparent background in seconds</p>
        </div>

        {/* Upload Zone */}
        {!original && (
          <label
            className={`block border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-colors ${
              dragging ? "border-violet-400 bg-violet-500/10" : "border-slate-600 hover:border-violet-500 hover:bg-slate-700/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            <div className="text-5xl mb-4">🖼️</div>
            <p className="text-xl font-medium mb-2">Drop your image here</p>
            <p className="text-slate-400">or click to browse · PNG, JPG, WEBP · Max 10MB</p>
          </label>
        )}

        {/* Processing State */}
        {loading && (
          <div className="text-center py-16">
            <div className="inline-block w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-slate-300">Removing background...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-300 text-center mb-6">
            {error}
          </div>
        )}

        {/* Result */}
        {original && !loading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <p className="text-sm text-slate-400 mb-3 font-medium">Original</p>
                <img src={original} alt="Original" className="w-full rounded-xl object-contain max-h-80" />
              </div>
              <div className="bg-slate-700/50 rounded-2xl p-4">
                <p className="text-sm text-slate-400 mb-3 font-medium">Background Removed</p>
                {result ? (
                  <div
                    className="rounded-xl overflow-hidden max-h-80 flex items-center justify-center"
                    style={{ background: "repeating-conic-gradient(#374151 0% 25%, #4b5563 0% 50%) 0 0 / 20px 20px" }}
                  >
                    <img src={result} alt="Result" className="max-h-80 object-contain" />
                  </div>
                ) : (
                  <div className="w-full h-64 rounded-xl bg-slate-600/50 flex items-center justify-center text-slate-500">
                    {error ? "Failed" : "Waiting..."}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              {result && (
                <button
                  onClick={downloadResult}
                  className="bg-violet-600 hover:bg-violet-500 px-8 py-3 rounded-xl font-medium transition-colors"
                >
                  ⬇️ Download PNG
                </button>
              )}
              <button
                onClick={() => { setOriginal(null); setResult(null); setError(null); }}
                className="bg-slate-700 hover:bg-slate-600 px-8 py-3 rounded-xl font-medium transition-colors"
              >
                Try Another Image
              </button>
            </div>
          </div>
        )}

        {/* Features */}
        {!original && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            {[
              { icon: "⚡", title: "Fast", desc: "Results in under 5 seconds" },
              { icon: "🎯", title: "Accurate", desc: "AI-powered precise cutouts" },
              { icon: "🆓", title: "Free to try", desc: "No signup required" },
            ].map((f) => (
              <div key={f.title} className="bg-slate-700/30 rounded-2xl p-6 text-center">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-slate-400 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
