import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fileToBase64, SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { archiveFileSchema, archiveLinkError, type ArchiveFile } from "../../server/src/archive-file";
import { api, type ApiResponse } from "./api";
import { bookContentsEntries, bookContentsHtml } from "./book-contents";

const sourceRepositoryUrl = "https://github.com/dadacula/life-in-chapters";

type Archive = ApiResponse<typeof api, "getArchive">;
type LifeEvent = Archive["events"][number];
type Person = Archive["people"][number];
type Upload = { kind: "photo" | "audio" | "video"; dataBase64: string; mimeType: string; fileName: string };
type SpeechRecognitionResultLike = { isFinal: boolean; 0?: { transcript: string } };
type SpeechRecognitionEventLike = Event & { resultIndex: number; results: { length: number; [index: number]: SpeechRecognitionResultLike | undefined } };
type SpeechRecognitionErrorEventLike = Event & { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type Tab = "river" | "chapters" | "people" | "search" | "settings";
const labels = ["美好", "不美好", "里程碑", "转折", "日常"] as const;
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const textDate = (event: Pick<LifeEvent, "dateMode" | "dateValue">) => event.dateMode === "year" ? `约 ${event.dateValue.slice(0,4)} 年` : event.dateValue.replaceAll("-", ".");

function Icon({ name, size = 20 }: { name: "river"|"book"|"people"|"search"|"settings"|"plus"|"mic"|"camera"|"video"|"x"|"more"|"download"|"chevron"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    river: <><path d="M5 3v18M5 7h10l-2.5-2.5M5 13h13l-2.5-2.5M5 19h8l-2.5-2.5"/></>, book:<><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 4.5v17M8 6h8M8 10h6"/></>,
    people:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1.03-1.56V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.56 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15z"/></>,
    plus:<path d="M12 5v14M5 12h14"/>, mic:<><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/></>, camera:<><path d="M14.5 4 16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4l1.5-3z"/><circle cx="12" cy="13" r="3"/></>, video:<><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></>, x:<path d="m6 6 12 12M18 6 6 18"/>, more:<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>, download:<><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>, chevron:<path d="m9 18 6-6-6-6"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

async function compressImage(file: File): Promise<Upload> {
  const bitmap = await createImageBitmap(file); const max = 1800; const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("照片处理失败")), "image/jpeg", .84));
  const encoded = await fileToBase64(blob); return { kind: "photo", ...encoded, fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

function preferredAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
}

function audioExtension(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function startChineseSpeechRecognition(onText: (text: string) => void, onFailure: (message: string) => void): SpeechRecognitionLike | null {
  const speechWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
  const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  if (!Recognition) return null;
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "zh-CN";
  let finalText = "";
  recognition.onresult = (event) => {
    let interimText = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result) continue;
      const transcript = result[0]?.transcript?.trim();
      if (!transcript) continue;
      if (result.isFinal) finalText = `${finalText}${transcript} `;
      else interimText += transcript;
    }
    onText(`${finalText}${interimText}`.trim());
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    onFailure("实时转写失败了，录音仍在继续。");
  };
  try { recognition.start(); return recognition; } catch { return null; }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function OwnedPhoto({ attachment, alt, className = "" }: { attachment: LifeEvent["attachments"][number]; alt: string; className?: string }) {
  const [localUrl, setLocalUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      try {
        const fresh = await api.getAttachmentPlayback({ id: attachment.id });
        const response = await fetch(fresh.url, { cache: "no-store" });
        if (!response.ok) throw new Error("photo unavailable");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength < 32) throw new Error("empty photo");
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: fresh.mimeType }));
        if (!cancelled) setLocalUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id]);
  if (failed) return <span className={`photo-unavailable ${className}`} role="img" aria-label={`${alt}，暂时无法载入`}><Icon name="camera"/><small>照片暂时无法载入</small></span>;
  if (!localUrl) return <span className={`photo-loading ${className}`} aria-label="正在载入照片"/>;
  return <img className={className} src={localUrl} alt={alt} onError={() => setFailed(true)}/>;
}

function MediaPlayback({ attachment, compact = false }: { attachment: LifeEvent["attachments"][number]; compact?: boolean }) {
  const [localUrl, setLocalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isVideo = attachment.kind === "video";
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  const load = async () => {
    if (loading) return;
    setLoading(true); setError("");
    try {
      const fresh = await api.getAttachmentPlayback({ id: attachment.id });
      const response = await fetch(fresh.url);
      if (!response.ok) throw new Error("download failed");
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 32) throw new Error("empty media");
      const blob = new Blob([bytes], { type: fresh.mimeType });
      setLocalUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
    } catch {
      setError(isVideo ? "视频暂时无法载入，请点重试。" : "语音暂时无法载入，请点重试。");
    } finally { setLoading(false); }
  };
  if (!localUrl) return <div className={`media-playback ${compact ? "compact" : ""}`}><button type="button" className="secondary" onClick={load} disabled={loading}><Icon name={isVideo ? "video" : "mic"}/>{loading ? "正在载入…" : isVideo ? "播放视频" : "播放语音"}</button>{error && <small role="alert">{error}</small>}</div>;
  return <div className={`media-playback ready ${compact ? "compact" : ""}`}>{isVideo ? <video controls playsInline preload="metadata" src={localUrl} onError={() => setError("这个视频格式无法在当前设备播放，可导出后用系统播放器打开。")}/> : <audio controls preload="metadata" src={localUrl} onError={() => setError("这个录音格式无法在当前设备播放，可导出后用系统播放器打开。")}/>} {error && <small role="alert">{error}</small>}</div>;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}><button className="modal-shade" onClick={onClose} aria-label="关闭"/><section className={`sheet ${wide ? "sheet-wide" : ""}`}><header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="关闭"><Icon name="x"/></button></header>{children}</section></div>;
}

function VoiceCapture({ onCaptured, onRecordingChange, idleLabel = "录一段声音", activeLabel = "结束录音", variant = "inline", disabled = false }: {
  onCaptured: (upload: Upload, transcript: string) => Promise<void> | void;
  onRecordingChange?: (recording: boolean) => void;
  idleLabel?: string;
  activeLabel?: string;
  variant?: "inline" | "elder";
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const transcriptRef = useRef("");
  const timer = useRef<number | null>(null);
  const elapsed = useRef(0);

  const clearTimer = () => { if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; } };
  const setRecordingState = (next: boolean) => { setRecording(next); onRecordingChange?.(next); };
  const stop = () => {
    recognition.current?.stop();
    recognition.current = null;
    const active = recorder.current;
    if (active?.state === "recording") {
      try { active.requestData(); } catch { /* Safari may not implement requestData while stopping. */ }
      active.stop();
    }
  };

  useEffect(() => () => {
    clearTimer();
    recognition.current?.abort();
    stream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const toggle = async () => {
    if (recording) { stop(); return; }
    setMessage(""); setTranscript(""); transcriptRef.current = ""; elapsed.current = 0; setSeconds(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("此设备暂不支持网页录音，可改用下方“选择音频文件”。"); return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = mediaStream;
      const preferred = preferredAudioMimeType();
      const nextRecorder = preferred ? new MediaRecorder(mediaStream, { mimeType: preferred }) : new MediaRecorder(mediaStream);
      chunks.current = [];
      nextRecorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.current.push(event.data); };
      nextRecorder.onerror = () => setMessage("录音中断了，请重新录一次。");
      nextRecorder.onstop = async () => {
        clearTimer(); setRecordingState(false); setProcessing(true);
        try {
          const mimeType = nextRecorder.mimeType || chunks.current[0]?.type || preferred || "audio/mp4";
          const blob = new Blob(chunks.current, { type: mimeType });
          if (blob.size < 128) throw new Error("empty audio");
          if (blob.size > 13_000_000) throw new Error("audio too large");
          const encoded = await fileToBase64(blob);
          await onCaptured({ kind: "audio", ...encoded, mimeType, fileName: `语音-${Date.now()}.${audioExtension(mimeType)}` }, transcriptRef.current.trim());
          setMessage(transcriptRef.current.trim() ? "录音已保存，并已把转写文字加入正文。" : "录音已保存。此设备没有返回转写文字，可在正文中继续补充。");
        } catch (error) {
          setMessage(error instanceof Error && error.message === "audio too large" ? "录音超过 13 MB，请分成两段保存。" : "录音没有保存成功，请重新录一次。");
        } finally {
          mediaStream.getTracks().forEach((track) => track.stop());
          stream.current = null; recorder.current = null; setProcessing(false);
        }
      };
      recorder.current = nextRecorder;
      const speech = startChineseSpeechRecognition(
        (text) => { transcriptRef.current = text; setTranscript(text); },
        (failure) => setMessage(failure),
      );
      recognition.current = speech;
      if (speech) speech.onend = () => { if (nextRecorder.state === "recording") { try { speech.start(); } catch { setMessage("实时转写中断了，录音仍在继续。"); } } };
      else setMessage("正在录音；此设备暂不支持实时转写，声音仍会正常保存。");
      nextRecorder.start(1000);
      setRecordingState(true);
      timer.current = window.setInterval(() => {
        const next = elapsed.current + 1;
        elapsed.current = next;
        setSeconds(next);
        if (next >= 300 && nextRecorder.state === "recording") stop();
      }, 1000);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
      setRecordingState(false); setMessage("无法打开麦克风。请在系统设置中允许麦克风权限，或选择已有音频文件。");
    }
  };

  return <div className={`voice-capture voice-${variant}`}>
    <button type="button" className={recording ? "recording secondary" : variant === "elder" ? "" : "secondary"} onClick={toggle} disabled={disabled || processing} aria-label={recording ? activeLabel : idleLabel}>
      <Icon name="mic" size={variant === "elder" ? 34 : 20}/><span>{processing ? "正在保存…" : recording ? activeLabel : idleLabel}</span>
    </button>
    {(recording || message || transcript) && <div className="voice-status" role="status">
      {recording && <b><i/>录音中 {formatDuration(seconds)} <small>最长 5 分钟</small></b>}
      {transcript && <p><span>实时转文字</span>{transcript}</p>}
      {message && <small>{message}</small>}
    </div>}
  </div>;
}

function Empty({ onCreate, onLoadDemo, demoBusy }: { onCreate: () => void; onLoadDemo: () => void; demoBusy: boolean }) {
  return <section className="empty-state"><h2>一生，值得被记住。</h2><p>先为自己或家人建立一卷档案，再从第一件重要的事写起。</p><div className="empty-actions"><button className="primary large" onClick={onCreate}>建立第一位人物</button><button className="secondary large" disabled={demoBusy} onClick={onLoadDemo}>{demoBusy ? "正在铺开示例…" : "先看看示例人生"}</button></div></section>;
}

export function App() {
  const qc = useQueryClient();
  const archive = useQuery({ queryKey: ["archive"], queryFn: () => api.getArchive({}) });
  const data: Archive = archive.data ?? { people: [], chapters: [], events: [] };
  const [tab, setTab] = useState<Tab>("river"); const [currentId, setCurrentId] = useState<number | null>(null); const [elder, setElder] = useState(false);
  const [eventEditor, setEventEditor] = useState<LifeEvent | "new" | null>(null); const [personEditor, setPersonEditor] = useState<Person | "new" | null>(null); const [detail, setDetail] = useState<LifeEvent | null>(null); const [bookPerson, setBookPerson] = useState<Person | null>(null);
  const [toast, setToast] = useState(""); const [confirm, setConfirm] = useState<{ text: string; run: () => void; actionLabel?: string } | null>(null); const [demoBusy, setDemoBusy] = useState(false);
  useEffect(() => { const first = data.people.find(person => person.isDemo) ?? data.people[0]; if (!currentId && first) setCurrentId(first.id); if (currentId && !data.people.some(p => p.id === currentId)) setCurrentId(first?.id ?? null); }, [data.people, currentId]);
  const current = data.people.find(p => p.id === currentId) ?? null; const currentEvents = data.events.filter(e => e.personId === currentId); const demoCount = data.people.filter(person => person.isDemo).length;
  const say = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };
  const refresh = async () => { await qc.invalidateQueries({ queryKey: ["archive"] }); };
  const loadDemo = async () => {
    setDemoBusy(true);
    try {
      const seeded = await api.seedMockData({});
      let media: { added: number };
      try {
        media = await api.ensureDemoMedia({});
      } catch (error) {
        if (seeded.added) {
          try { await api.clearMockData({}); }
          catch { await refresh(); say("示例照片没有生成，已写入的示例也没能撤回。"); return; }
        }
        await refresh();
        const message = error instanceof Error ? error.message : "";
        say(seeded.added ? "示例照片没有生成，这次示例已经撤回。请重试。" : (message.includes("示例") ? message : "示例照片没有生成，请重试。"));
        return;
      }
      await refresh();
      if (seeded.added) say(media.added > 0 ? "示例人生与照片已经铺开" : "示例人生已经铺开。示例照片没有生成，可以稍后再试。");
      else say("示例人生已经在这里了");
    } catch (error) {
      await refresh();
      const message = error instanceof Error ? error.message : "";
      say(message.includes("示例") ? message : "示例人生没有铺开，请重试。");
    } finally { setDemoBusy(false); }
  };
  const askClearDemo = () => setConfirm({ text: "清空两位示例人物和全部示例故事？你自己创建的记录不会受到影响。", actionLabel: "清空示例", run: async () => { await api.clearMockData({}); await refresh(); setConfirm(null); say("示例内容已清空"); } });
  if (archive.isPending) return <main className="loading"><div className="ink-loader"/><p>正在展开人生卷轴…</p></main>;
  if (archive.error) return <main className="loading"><h2>暂时无法打开记录</h2><p>{String(archive.error)}</p><button className="primary" onClick={() => archive.refetch()}>重试</button></main>;

  return <div className={`app ${elder ? "elder" : ""}`}>
    <SafeAreaTopScrim backgroundColor="var(--bg)" />
    {data.people.length === 0 ? <Empty onCreate={() => setPersonEditor("new")} onLoadDemo={loadDemo} demoBusy={demoBusy}/> : <>
      <header className="topbar">
        <div className="person-switch"><span className="avatar">{current?.name.slice(0,1)}</span><label><span>正在记录</span><select aria-label="切换当前人物" value={currentId ?? ""} onChange={e => setCurrentId(Number(e.target.value))}>{data.people.map(person => <option key={person.id} value={person.id}>{person.name} · {person.relationship}{person.isDemo ? " · 示例" : ""}</option>)}</select></label></div>
        {!elder && <div className="top-actions">
          <button type="button" className={`icon-btn ${tab === "search" ? "active" : ""}`} aria-label="搜索" aria-pressed={tab === "search"} onClick={() => setTab(tab === "search" ? "river" : "search")}><Icon name="search"/></button>
          <button type="button" className={`icon-btn ${tab === "settings" ? "active" : ""}`} aria-label="设置" aria-pressed={tab === "settings"} onClick={() => setTab(tab === "settings" ? "river" : "settings")}><Icon name="settings"/></button>
          {(tab !== "river" || currentEvents.length > 0) && <button type="button" className="primary write-btn" onClick={() => setEventEditor("new")}>记下</button>}
        </div>}
        <button className={`elder-toggle ${elder ? "active" : ""}`} onClick={() => setElder(v => !v)}>{elder ? "退出长辈模式" : "长辈模式"}</button>
      </header>
      {current?.isDemo && demoCount > 0 && <aside className="demo-banner" aria-label="示例内容提示"><div><b>示例人生</b><span>当前人物与故事均为虚构，仅用于体验。</span></div><button onClick={askClearDemo}>清空示例</button></aside>}
      {elder && current ? <ElderHome person={current} onSaved={async () => { await refresh(); say("已经保存到时间长河"); }} onMemories={() => { setElder(false); setTab("river"); }}/>:<>
        <main className="content">
          {tab === "river" && <River person={current} events={currentEvents} onOpen={setDetail} onCreate={() => setEventEditor("new")}/>} 
          {tab === "chapters" && current && <ChaptersView person={current} chapters={data.chapters.filter(c=>c.personId===current.id)} events={currentEvents} onOpen={setDetail} refresh={refresh} say={say} setConfirm={setConfirm}/>} 
          {tab === "people" && <PeopleView people={data.people} currentId={currentId} onChoose={id=>{setCurrentId(id);setTab("river");}} onCreate={()=>setPersonEditor("new")} onEdit={setPersonEditor} setConfirm={setConfirm} refresh={refresh} say={say}/>} 
          {tab === "search" && <SearchView data={data} onOpen={setDetail}/>} 
          {tab === "settings" && <SettingsView data={data} current={current} onPreview={()=>current&&setBookPerson(current)} say={say} refresh={refresh}/>}
        </main>
        <nav className="bottom-nav" aria-label="主要导航">{([{id:"river",icon:"river",label:"时间长河"},{id:"chapters",icon:"book",label:"章节"},{id:"people",icon:"people",label:"人物"}] as const).map(item=><button key={item.id} className={tab===item.id?"active":""} onClick={()=>setTab(item.id)}><Icon name={item.icon}/><span>{item.label}</span></button>)}</nav>
      </>}
    </>}
    {eventEditor && current && <EventEditor person={current} people={data.people} chapters={data.chapters.filter(c=>c.personId===current.id)} value={eventEditor} onClose={()=>setEventEditor(null)} onSaved={async()=>{await refresh();setEventEditor(null);say("这件事已保存到时间长河");}}/>}
    {personEditor && <PersonEditor value={personEditor} onClose={()=>setPersonEditor(null)} onSaved={async id=>{await refresh();setCurrentId(id);setPersonEditor(null);say("人物档案已保存");}}/>}
    {detail && <EventDetail event={detail} people={data.people} chapter={data.chapters.find(c=>c.id===detail.chapterId)} onClose={()=>setDetail(null)} onEdit={()=>{setDetail(null);setCurrentId(detail.personId);setEventEditor(detail);}} onDelete={()=>setConfirm({text:"这段回忆将被永久删除，照片、语音和视频也无法找回。",run:async()=>{await api.deleteEvent({id:detail.id});await refresh();setDetail(null);setConfirm(null);say("这段记录已删除");}})}/>} 
    {bookPerson && <BookPreview person={bookPerson} events={data.events.filter(event=>event.personId===bookPerson.id)} chapters={data.chapters.filter(chapter=>chapter.personId===bookPerson.id)} onClose={()=>setBookPerson(null)}/>} 
    {confirm && <Modal title="请再次确认" onClose={()=>setConfirm(null)}><div className="confirm-box"><p>{confirm.text}</p><div className="button-row"><button className="secondary" onClick={()=>setConfirm(null)}>再想想</button><button className="danger" onClick={confirm.run}>{confirm.actionLabel ?? "永久删除"}</button></div></div></Modal>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div>;
}

function River({ person, events, onOpen, onCreate }: { person: Person|null; events: LifeEvent[]; onOpen:(e:LifeEvent)=>void; onCreate:()=>void }) {
  if (!person) return null; if (!events.length) return <section className="river-empty"><div className="year-mark">从这里开始</div><h1>{person.name}的人生长河</h1><p>不必从出生写起。先记下此刻最想留住的那件事。</p><button className="primary" onClick={onCreate}>记录第一件大事</button></section>;
  const groups = events.reduce<Record<string,LifeEvent[]>>((acc,event)=>{const year=event.dateValue.slice(0,4);(acc[year]??=[]).push(event);return acc;},{});
  const md = todayLocal().slice(5); const today = events.filter(e=>e.dateMode==="exact"&&e.dateValue.slice(5)===md); const anniversary = today[0];
  return <section><div className="page-intro"><div><h1>{person.name}的时间长河</h1></div><span>{events.length} 件大事</span></div>{anniversary&&<div className="on-this-day"><p>历史上的今天</p><button onClick={()=>onOpen(anniversary)}>{anniversary.title}<Icon name="chevron" size={16}/></button></div>}<div className="timeline">{Object.entries(groups).sort(([a],[b])=>Number(b)-Number(a)).map(([year,items])=><section className="year-group" key={year}><h2>{year}<small>年</small></h2><div>{items.map(event=><EventCard key={event.id} event={event} onOpen={()=>onOpen(event)}/>)}</div></section>)}</div></section>;
}
function EventCard({ event, onOpen }: { event: LifeEvent; onOpen:()=>void }) { const photo=event.attachments.find(a=>a.kind==="photo"); const photoCount=event.attachments.filter(a=>a.kind==="photo").length; const audioCount=event.attachments.filter(a=>a.kind==="audio").length; const videoCount=event.attachments.filter(a=>a.kind==="video").length; const mediaLabel=[photoCount?`照片 ${photoCount}`:"",audioCount?`声音 ${audioCount}`:"",videoCount?`视频 ${videoCount}`:""].filter(Boolean).join(" · "); return <article className="event-card" onClick={onOpen} tabIndex={0} onKeyDown={e=>e.key==="Enter"&&onOpen()}><span className={`dot tag-${event.significance}`}/><div className="event-copy"><div className="event-meta"><time>{textDate(event)}</time><span className={`tag tag-${event.significance}`}>{event.significance}</span></div><h3>{event.title}</h3>{event.body&&<p>{event.body}</p>}<div className="event-foot">{event.location&&<small>地点 · {event.location}</small>}{mediaLabel&&<span className="media-count">{mediaLabel}</span>}</div></div>{photo&&<OwnedPhoto attachment={photo} alt={`${event.title}的照片`}/>}</article>; }

function ChaptersView({ person, chapters, events, onOpen, refresh, say, setConfirm }: { person:Person;chapters:Archive["chapters"];events:LifeEvent[];onOpen:(e:LifeEvent)=>void;refresh:()=>Promise<void>;say:(s:string)=>void;setConfirm:(v:{text:string;run:()=>void}|null)=>void }) {
 const [adding,setAdding]=useState(false); const [title,setTitle]=useState(""); const [editingId,setEditingId]=useState<number|null>(null); const [editingTitle,setEditingTitle]=useState("");
 const add=async()=>{if(!title.trim())return;await api.createChapter({personId:person.id,title:title.trim()});setTitle("");setAdding(false);await refresh();say("新章节已加入");};
 const saveTitle=async()=>{if(!editingId||!editingTitle.trim())return;await api.updateChapter({id:editingId,title:editingTitle.trim()});setEditingId(null);await refresh();say("章节名称已更新");};
 const move=async(index:number,delta:number)=>{const next=[...chapters];const target=index+delta;if(target<0||target>=next.length)return;const current=next[index];const other=next[target];if(!current||!other)return;next[index]=other;next[target]=current;await api.reorderChapters({orderedIds:next.map(c=>c.id)});await refresh();};
 return <section><div className="page-intro"><div><h1>章节</h1></div><button className="text-btn" onClick={()=>setAdding(true)}>新章节</button></div>{adding&&<div className="inline-editor"><input aria-label="新章节名称" autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：远行"/><button onClick={add}>保存</button></div>}<div className="chapter-list">{chapters.map((chapter,index)=>{const items=events.filter(e=>e.chapterId===chapter.id);return <section key={chapter.id} className="chapter-section"><div className="chapter-number">{String(index+1).padStart(2,"0")}</div><div className="chapter-body"><div className="chapter-title">{editingId===chapter.id?<div className="chapter-rename"><input aria-label={`编辑章节 ${chapter.title}`} value={editingTitle} onChange={e=>setEditingTitle(e.target.value)}/><button onClick={saveTitle}>保存</button></div>:<><h2>{chapter.title}</h2><span>{items.length} 件</span><div className="chapter-tools"><button aria-label={`上移章节 ${chapter.title}`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button aria-label={`下移章节 ${chapter.title}`} disabled={index===chapters.length-1} onClick={()=>move(index,1)}>↓</button><button onClick={()=>{setEditingId(chapter.id);setEditingTitle(chapter.title)}}>改名</button><button aria-label={`删除章节 ${chapter.title}`} onClick={()=>setConfirm({text:`删除“${chapter.title}”章节？其中的大事记会保留在未归档中。`,run:async()=>{await api.deleteChapter({id:chapter.id});await refresh();setConfirm(null);say("章节已删除，记录仍被保留");}})}>删除</button></div></>}</div>{items.length?items.map(e=><button className="chapter-event" key={e.id} onClick={()=>onOpen(e)}><time>{textDate(e)}</time><b>{e.title}</b><Icon name="chevron" size={16}/></button>):<p className="muted">这一章还没有写下故事。</p>}</div></section>})}{events.some(e=>e.chapterId===null)&&<section className="chapter-section"><div className="chapter-number">—</div><div className="chapter-body"><div className="chapter-title"><h2>未归档</h2><span>{events.filter(e=>e.chapterId===null).length} 件</span></div>{events.filter(e=>e.chapterId===null).map(e=><button className="chapter-event" key={e.id} onClick={()=>onOpen(e)}><time>{textDate(e)}</time><b>{e.title}</b></button>)}</div></section>}</div></section>;
}

function PeopleView({people,currentId,onChoose,onCreate,onEdit,setConfirm,refresh,say}:{people:Person[];currentId:number|null;onChoose:(id:number)=>void;onCreate:()=>void;onEdit:(p:Person)=>void;setConfirm:(v:{text:string;run:()=>void}|null)=>void;refresh:()=>Promise<void>;say:(s:string)=>void}) { return <section><div className="page-intro"><div><h1>人物</h1></div><button className="text-btn" onClick={onCreate}>添加人物</button></div><div className="people-list">{people.map(person=><article key={person.id} className={person.id===currentId?"current":""}><button className="person-main" onClick={()=>onChoose(person.id)}><span className="portrait">{person.name.slice(0,1)}</span><span><b>{person.name}{person.isDemo && <em className="demo-chip">示例</em>}</b><small>{person.relationship} · {person.eventCount} 件大事</small></span>{person.id===currentId&&<i>当前</i>}</button><div className="person-actions"><button onClick={()=>onEdit(person)}>编辑</button><button onClick={()=>setConfirm({text:`“${person.name}”的全部大事记、照片、语音与视频将被永久删除。`,run:async()=>{await api.deletePerson({id:person.id});await refresh();setConfirm(null);say("人物档案已删除");}})}>删除</button></div></article>)}</div></section>; }

function SearchView({data,onOpen}:{data:Archive;onOpen:(e:LifeEvent)=>void}) { const [q,setQ]=useState("");const [tag,setTag]=useState(""); const results=useMemo(()=>data.events.filter(e=>{const hay=[e.title,e.body,e.location,e.dateValue,...e.customTags,data.people.find(p=>p.id===e.personId)?.name??""].join(" ").toLowerCase();return (!q||hay.includes(q.toLowerCase()))&&(!tag||e.significance===tag);}),[data,q,tag]);return <section><div className="page-intro"><div><h1>搜索</h1></div></div><label className="search-box"><Icon name="search"/><input aria-label="搜索关键词、年份、地点或人物" autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="关键词、年份、地点或人物"/></label><div className="filter-row"><button className={!tag?"active":""} onClick={()=>setTag("")}>全部</button>{labels.map(item=><button key={item} className={tag===item?"active":""} onClick={()=>setTag(item)}>{item}</button>)}</div><p className="result-count">找到 {results.length} 件大事</p><div className="search-results">{results.map(event=><button key={event.id} onClick={()=>onOpen(event)}><time>{textDate(event)}</time><span><b>{event.title}</b><small>{data.people.find(p=>p.id===event.personId)?.name} · {event.significance}</small></span><Icon name="chevron" size={16}/></button>)}</div>{results.length===0&&<div className="small-empty"><p>没有找到相符的往事</p><small>试试年份、地点或一句记得的话。</small></div>}</section>; }

function BookPreview({person,events,chapters,onClose}:{person:Person;events:LifeEvent[];chapters:Archive["chapters"];onClose:()=>void}) {
 const [page,setPage]=useState<"cover"|"contents"|number>("cover");
 const ordered=[...events].sort((a,b)=>a.dateValue.localeCompare(b.dateValue));
 const selected=typeof page==="number"?ordered[page]:undefined;
 const pageNumber=typeof page==="number"?page:0;
 const selectedChapter=selected?chapters.find(chapter=>chapter.id===selected.chapterId):undefined;
 const selectedPhotos=selected?.attachments.filter(attachment=>attachment.kind==="photo")??[];
 const selectedMedia=selected?.attachments.filter(attachment=>attachment.kind==="audio"||attachment.kind==="video")??[];
 const next=()=>{if(page==="cover")setPage("contents");else if(page==="contents"&&ordered.length)setPage(0);else if(typeof page==="number"&&page<ordered.length-1)setPage(page+1);};
 const previous=()=>{if(page==="contents")setPage("cover");else if(typeof page==="number")setPage(page===0?"contents":page-1);};
 const jumpToChapter=(chapterId:number)=>{const index=ordered.findIndex(event=>event.chapterId===chapterId);if(index>=0)setPage(index);};
 return <Modal title={`${person.name}的人生书`} onClose={onClose} wide><div className="book-reader">
   <div className="book-reader-top"><div><span>屏幕样书</span><p>封面、目录、文字、照片与影音的最终版式</p></div><b>{ordered.length+2} 页</b></div>
   <div className={`book-paper book-page-${page}`}>
     {page==="cover"&&<section className="book-cover">
       <div className="book-corner corner-one"/><div className="book-corner corner-two"/>
       <p className="book-series">一生 · 人生大事记</p>
       <div className="book-emblem" aria-hidden="true"><span>生</span></div>
       <div className="book-cover-title"><small>{person.relationship}的故事</small><h2>{person.name}</h2><p>人生书</p></div>
       <div className="book-cover-rule"><span/></div>
       <footer><span>{events.length} 件大事</span><i>从记忆中来，向岁月深处去</i></footer>
     </section>}
     {page==="contents"&&<section className="book-contents">
       <header><span>CONTENTS</span><h2>人生章节</h2><p>{person.name} · 共 {events.length} 篇</p></header>
       <div className="book-content-list">{bookContentsEntries(chapters, events).map(item => <button key={item.key} disabled={!item.count} onClick={() => { if (item.chapterId === null) { const index = ordered.findIndex(event => event.chapterId === null); if (index >= 0) setPage(index); } else jumpToChapter(item.chapterId); }}><span>{item.label}</span><b>{item.title}</b><i/><small>{item.count} 篇</small></button>)}</div>
       {!events.length&&<div className="book-empty-page"><b>故事还没有落笔</b><span>先记下一件事，它会从这里成为第一页。</span></div>}
       <footer className="book-folio">目录 · 02</footer>
     </section>}
     {selected&&<article className="book-story">
       <header className="book-running-head"><span>{person.name} · 人生书</span><b>{String(pageNumber+3).padStart(2,"0")}</b></header>
       <div className="book-story-heading"><p>{selectedChapter?`第 ${String(selectedChapter.sortOrder+1).padStart(2,"0")} 章 · ${selectedChapter.title}`:"未归档篇章"}</p><time>{textDate(selected)}</time><h2>{selected.title}</h2><div className="book-story-meta"><span>{selected.significance}</span>{selected.location&&<small>{selected.location}</small>}</div></div>
       <div className="book-story-copy">{selected.body||"这页只留下了题目，等以后慢慢补上。"}</div>
       {selectedPhotos.length>0&&<figure className={`book-photo-layout count-${Math.min(selectedPhotos.length,3)}`}>{selectedPhotos.map((attachment,index)=><OwnedPhoto key={attachment.id} attachment={attachment} alt={`${selected.title}的照片 ${index+1}`}/>) }<figcaption>{selected.title} · 影像留存</figcaption></figure>}
       {selectedMedia.length>0&&<section className="book-media-section"><header><span>影音档案</span><small>{selectedMedia.length} 段</small></header>{selectedMedia.map((attachment,index)=><div className={`book-media-item ${attachment.kind}`} key={attachment.id}><div className="book-media-label"><b>{attachment.kind==="video"?"影像回忆":"有声回忆"}</b><span>{String(index+1).padStart(2,"0")}</span></div><MediaPlayback attachment={attachment} compact/></div>)}</section>}
       <footer className="book-folio">{selectedChapter?.title??"人生记事"} · {String(pageNumber+3).padStart(2,"0")}</footer>
     </article>}
   </div>
   <div className="book-pagination"><button className="secondary" disabled={page==="cover"} onClick={previous}>上一页</button><span>{page==="cover"?"封面 · 01":page==="contents"?"目录 · 02":`${page+1} / ${ordered.length} 篇`}</span><button className="primary" disabled={(page==="contents"&&!ordered.length)||(typeof page==="number"&&page>=ordered.length-1)} onClick={next}>下一页</button></div>
 </div></Modal>;
}

function SettingsView({data,current,onPreview,say,refresh}:{data:Archive;current:Person|null;onPreview:()=>void;say:(s:string)=>void;refresh:()=>Promise<void>}) {
 const [busy,setBusy]=useState(false); const [bookBusy,setBookBusy]=useState(false);
 const [bookFile,setBookFile]=useState<{url:string;name:string;size:number}|null>(null);
 const [pendingImport,setPendingImport]=useState<ArchiveFile|null>(null);
 const [replaceArmed,setReplaceArmed]=useState(false);
 const importFileRef=useRef<HTMLInputElement|null>(null);
 const realPeople=data.people.filter(person=>!person.isDemo);
 useEffect(()=>()=>{if(bookFile?.url)URL.revokeObjectURL(bookFile.url);},[bookFile?.url]);
 const exportJson=async()=>{setBusy(true);try{const enriched=await Promise.all(data.events.map(async e=>({...e,attachments:await Promise.all(e.attachments.map(async a=>{const dataUrl=await attachmentToDataUrl(a);const dataBase64=dataUrl.split(",")[1]??"";if(!dataBase64)throw new Error("媒体文件内容为空");return {kind:a.kind,mimeType:a.kind==="photo"?"image/jpeg":a.mimeType,fileName:a.fileName,dataBase64};}))})));const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),people:data.people,chapters:data.chapters,events:enriched},null,2)],{type:"application/json"});const prepared=await api.prepareDownload({kind:"archive",dataBase64:await blobToBase64(blob)});triggerDownload(prepared.url,`一生-全部记录-${todayLocal()}.json`);say("完整数据已开始保存");}catch(error){say(exportErrorMessage(error));}finally{setBusy(false)}};
 const book=async()=>{
   if(!current)return;
   setBookFile(null);
   setBookBusy(true);
   try{
     const events=data.events.filter(event=>event.personId===current.id).sort((a,b)=>a.dateValue.localeCompare(b.dateValue));
     const chapters=data.chapters.filter(chapter=>chapter.personId===current.id);
     const withMedia=await Promise.all(events.map(async event=>({...event,attachments:await Promise.all(event.attachments.map(async attachment=>({attachment,dataUrl:await attachmentToDataUrl(attachment)})))})));
     const chapterName=(chapterId:number|null)=>chapters.find(chapter=>chapter.id===chapterId)?.title??"未归档";
     const contents=bookContentsHtml(chapters, events);
     const stories=withMedia.map((event,index)=>{
       const photos=event.attachments.filter(item=>item.attachment.kind==="photo");
       const media=event.attachments.filter(item=>item.attachment.kind!=="photo");
       const photoHtml=photos.length?`<figure class="photos count-${Math.min(photos.length,3)}">${photos.map(({dataUrl})=>`<img src="${dataUrl}" alt="${escapeHtml(event.title)}的照片">`).join("")}<figcaption>${escapeHtml(event.title)} · 影像留存</figcaption></figure>`:"";
       const mediaHtml=media.length?`<section class="media"><header><b>影音档案</b><small>${media.length} 段</small></header>${media.map(({attachment,dataUrl},mediaIndex)=>`<div class="media-item ${attachment.kind}"><p><b>${attachment.kind==="video"?"影像回忆":"有声回忆"}</b><span>${String(mediaIndex+1).padStart(2,"0")}</span></p>${attachment.kind==="video"?`<video controls playsinline preload="metadata" src="${dataUrl}"></video>`:`<audio controls preload="metadata" src="${dataUrl}"></audio>`}</div>`).join("")}</section>`:"";
       return `<article class="page story"><header class="running"><span>${escapeHtml(current.name)} · 人生书</span><b>${String(index+3).padStart(2,"0")}</b></header><div class="heading"><p>第 ${String(index+1).padStart(2,"0")} 篇 · ${escapeHtml(chapterName(event.chapterId))}</p><time>${escapeHtml(textDate(event))}</time><h2>${escapeHtml(event.title)}</h2><div><span>${escapeHtml(event.significance)}</span>${event.location?`<small>${escapeHtml(event.location)}</small>`:""}</div></div><div class="copy">${escapeHtml(event.body||"这页只留下了题目，等以后慢慢补上。")}</div>${photoHtml}${mediaHtml}<footer>${escapeHtml(chapterName(event.chapterId))} · ${String(index+3).padStart(2,"0")}</footer></article>`;
     }).join("");
     const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(current.name)}的人生书</title><style>:root{--paper:#f2eadc;--ink:#28221b;--muted:#756b5f;--rule:#cdbfa9;--red:#96432e}*{box-sizing:border-box}html{background:#d8d0c3}body{margin:0;color:var(--ink);background:#d8d0c3;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif}.page{position:relative;width:min(100%,820px);min-height:1080px;margin:32px auto;padding:78px 84px;background:var(--paper);box-shadow:0 18px 60px rgba(40,30,20,.18);overflow:visible}.cover{display:flex;min-height:1080px;flex-direction:column;align-items:center;text-align:center}.cover:before,.cover:after{content:'';position:absolute;width:140px;height:140px;border-color:var(--red);opacity:.72}.cover:before{top:34px;left:34px;border-top:1px solid;border-left:1px solid}.cover:after{right:34px;bottom:34px;border-right:1px solid;border-bottom:1px solid}.series{font-size:12px;letter-spacing:.34em;color:var(--red)}.emblem{display:grid;place-items:center;width:108px;height:108px;margin:148px 0 64px;border:1px solid var(--red);transform:rotate(45deg)}.emblem span{font:44px 'Songti SC','STSong','SimSun',serif;color:var(--red);transform:rotate(-45deg)}.cover small{font-size:12px;letter-spacing:.28em;color:var(--muted)}.cover h1{font:500 60px/1.2 'Songti SC','STSong','SimSun',serif;letter-spacing:.12em;margin:18px 0 8px}.cover h2{font:400 22px 'Songti SC','STSong','SimSun',serif;letter-spacing:.3em;margin:0}.cover hr{width:36px;border:0;border-top:1px solid var(--red);margin:58px auto 36px}.cover footer{display:flex;flex-direction:column;gap:8px;margin-top:auto;font-size:12px;color:var(--muted)}.cover footer i{font:italic 13px 'Songti SC','STSong','SimSun',serif}.contents header>span,.heading>p{font-size:11px;letter-spacing:.26em;color:var(--red)}.contents h1{font:500 42px 'Songti SC','STSong','SimSun',serif;margin:10px 0}.contents header p{color:var(--muted);margin:0 0 62px}.contents ol{list-style:none;margin:0;padding:0}.contents li{display:grid;grid-template-columns:36px auto 1fr auto;align-items:center;gap:12px;padding:17px 0;border-bottom:1px solid var(--rule)}.contents li span,.contents li small{color:var(--muted);font-size:12px}.contents li b{font:500 19px 'Songti SC','STSong','SimSun',serif}.contents li i{height:1px;background:linear-gradient(90deg,var(--rule) 50%,transparent 50%);background-size:6px 1px}.running{display:flex;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid var(--rule);color:var(--muted);font-size:10px;letter-spacing:.18em}.heading{padding:70px 0 44px}.heading time{display:block;color:var(--muted);font:italic 14px Georgia,serif;margin:22px 0 10px}.heading h2{font:500 44px/1.25 'Songti SC','STSong','SimSun',serif;margin:0;letter-spacing:-.02em}.heading div{display:flex;gap:14px;align-items:center;margin-top:20px}.heading div span{padding:4px 9px;border:1px solid var(--red);color:var(--red);font-size:11px}.heading div small{color:var(--muted)}.copy{white-space:pre-wrap;font:18px/2 'Songti SC','STSong','SimSun',serif;text-align:justify}.copy:first-letter{float:left;font-size:54px;line-height:.88;margin:9px 8px 0 0;color:var(--red)}.photos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:46px 0 0}.photos img{display:block;width:100%;height:260px;object-fit:cover;background:#211d18}.photos img:first-child:last-of-type{grid-column:1/-1;height:410px}.photos img:first-child:nth-last-of-type(3){grid-row:span 2;height:528px}.photos figcaption{grid-column:1/-1;border-top:1px solid var(--rule);padding-top:9px;color:var(--muted);font-size:10px;letter-spacing:.12em}.media{margin-top:44px;border-top:1px solid var(--rule)}.media>header,.media-item p{display:flex;justify-content:space-between;align-items:center}.media>header{padding:18px 0;font-size:12px;letter-spacing:.18em;color:var(--red)}.media-item{padding:18px;margin-bottom:12px;background:#e6dccd}.media-item p{margin:0 0 12px;font-size:12px}.media-item p span{color:var(--muted)}video,audio{display:block;width:100%}video{max-height:430px;background:#171512;object-fit:contain}.story>footer,.contents>footer{margin-top:56px;padding-top:14px;border-top:1px solid var(--rule);text-align:center;color:var(--muted);font-size:10px;letter-spacing:.16em}.story{padding-bottom:72px}.story+.story{margin-top:0}.photos,.media,.media-item{break-inside:avoid;page-break-inside:avoid}@media(max-width:700px){.page{min-height:100vh;margin:0;padding:48px 24px;box-shadow:none}.cover{min-height:calc(100vh - 96px)}.cover .emblem{margin:18vh 0 52px}.cover h1{font-size:44px}.heading{padding:48px 0 30px}.heading h2{font-size:34px}.photos{grid-template-columns:1fr}.photos img,.photos img:first-child:nth-last-of-type(3),.photos img:first-child:last-of-type{grid-column:auto;grid-row:auto;height:auto;max-height:70vh}.story>footer,.contents>footer{margin-top:40px}.contents li{grid-template-columns:30px auto 1fr auto}.copy{font-size:17px}}@media print{@page{size:A4;margin:0}html,body{background:white}.page{width:210mm;min-height:297mm;margin:0;padding:18mm 20mm;box-shadow:none;break-after:page}.cover{min-height:297mm}.story{break-after:page}.story>footer,.contents>footer{margin-top:12mm}video{max-height:110mm}}</style></head><body><section class="page cover"><p class="series">一生 · 人生大事记</p><div class="emblem"><span>生</span></div><small>${escapeHtml(current.relationship)}的故事</small><h1>${escapeHtml(current.name)}</h1><h2>人生书</h2><hr><footer><span>${events.length} 件大事 · 整理于 ${todayLocal().replaceAll("-",".")}</span><i>从记忆中来，向岁月深处去</i></footer></section><section class="page contents"><header><span>CONTENTS</span><h1>人生章节</h1><p>${escapeHtml(current.name)} · 共 ${events.length} 篇</p></header><ol>${contents}</ol><footer>目录 · 02</footer></section>${stories}</body></html>`;
     const blob=new Blob([html],{type:"text/html;charset=utf-8"});
     const fileName=`${current.name}-人生书-${todayLocal()}.html`;
     setBookFile({url:URL.createObjectURL(blob),name:fileName,size:blob.size});
     say("人生书已在本机准备好，请点“保存人生书”下载文件");
   }catch(error){say(exportErrorMessage(error));}finally{setBookBusy(false)}
 };
 const runImport=async(file:ArchiveFile,replaceExisting:boolean)=>{
  setBusy(true);
  try{
    const result=await api.importArchive({...file,replaceExisting});
    await refresh();
    setPendingImport(null);
    setReplaceArmed(false);
    say(replaceExisting?`已替换 ${result.peopleReplaced} 位原有人物，并导入 ${result.peopleAdded} 位人物、${result.eventsAdded} 件大事。`:`已导入 ${result.peopleAdded} 位人物、${result.eventsAdded} 件大事，原有记录仍在。`);
  }catch(error){say(importErrorMessage(error));}finally{setBusy(false);}
 };
 const onImportFile=async(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  setBusy(true);
  let parsed:ArchiveFile|null=null;
  try{
    const parsedJson:unknown=JSON.parse(await file.text());
    const result=archiveFileSchema.safeParse(parsedJson);
    if(!result.success){say("这份文件不是本应用导出的记录。");return;}
    const linkError=archiveLinkError(result.data);
    if(linkError){say(linkError);return;}
    parsed=result.data;
  }catch{say("无法读取这个文件，请确认它是导出的 JSON。");return;}
  finally{setBusy(false);}
  if(!parsed)return;
  if(realPeople.length>0){setReplaceArmed(false);setPendingImport(parsed);return;}
  await runImport(parsed,false);
 };
 return <><section><div className="page-intro"><div><h1>设置</h1></div></div><div className="settings-group"><div><h2>带走全部记录</h2><p>导出人物、章节、文字、照片、语音和视频。同一份 JSON 也可以再导入回来。文件属于你。</p></div><div className="settings-actions"><button className="secondary" disabled={busy} onClick={exportJson}><Icon name="download"/>{busy?"正在整理…":"导出全部 JSON"}</button><button className="secondary" disabled={busy} onClick={()=>importFileRef.current?.click()}>导入 JSON</button><input ref={importFileRef} hidden type="file" accept="application/json,.json" onChange={onImportFile}/></div></div><div className="settings-group book-setting"><div><h2>排成一本人生书</h2><p>先在屏幕上翻看封面、目录和内页；满意后再下载完整排版。照片、声音和视频会随书一并带走。</p></div><div className="book-actions"><button className="secondary" disabled={!current} onClick={onPreview}><Icon name="book"/>预览人生书</button>{bookFile?<><button type="button" className="secondary book-download-ready" onClick={()=>triggerDownload(bookFile.url,bookFile.name)}><Icon name="download"/><span>保存人生书<small>{(bookFile.size/1024/1024).toFixed(1)} MB · 本机 HTML 文件</small></span></button><button className="text-btn book-regenerate" disabled={bookBusy} onClick={book}>重新生成</button></>:<button className="secondary" disabled={!current||bookBusy} onClick={book}><Icon name="download"/>{bookBusy?"正在装订…":"生成下载文件"}</button>}</div></div><p className="source-note"><a href={sourceRepositoryUrl} target="_blank" rel="noopener noreferrer">源代码</a>在 GitHub。仓库只含程序，不含你的记录、照片、录音、视频或数据库。</p></section>
 {pendingImport&&<Modal title="导入记录" onClose={()=>{if(!busy){setPendingImport(null);setReplaceArmed(false);}}}><div className="confirm-box"><p>这份文件有 {pendingImport.people.length} 位人物、{pendingImport.chapters.length} 个章节、{pendingImport.events.length} 件大事。合并导入会保留现有的 {realPeople.length} 位自己的人物，也不会删除示例人物。</p><div className="button-row"><button className="secondary" disabled={busy} onClick={()=>runImport(pendingImport,false)}>保留现有并导入</button><button className="danger" disabled={busy} onClick={()=>setReplaceArmed(true)}>替换现有人物</button></div>{replaceArmed&&<><p>替换会删除现有非示例人物，以及他们的章节、大事记、照片、语音和视频。示例人物不会删除。请再确认一次。</p><button className="danger full" disabled={busy} onClick={()=>runImport(pendingImport,true)}>{busy?"正在导入…":"确认替换并导入"}</button></>}</div></Modal>}
 </>;
}
async function blobToDataUrl(blob:Blob):Promise<string>{return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}
async function blobToBase64(blob:Blob):Promise<string>{const dataUrl=await blobToDataUrl(blob);const comma=dataUrl.indexOf(",");if(comma<0)throw new Error("文件编码失败");return dataUrl.slice(comma+1);}
async function photoBlobToJpegDataUrl(blob:Blob):Promise<string>{const objectUrl=URL.createObjectURL(blob);try{const image=new Image();image.decoding="async";image.src=objectUrl;await image.decode();const max=1024;const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext("2d");if(!context)throw new Error("照片处理失败");context.fillStyle="#f2eadc";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("照片处理失败")),"image/jpeg",.72));return await blobToDataUrl(jpeg);}finally{URL.revokeObjectURL(objectUrl);}}
async function attachmentToDataUrl(attachment:LifeEvent["attachments"][number]):Promise<string>{const fresh=await api.getAttachmentPlayback({id:attachment.id});const response=await fetch(fresh.url,{cache:"no-store"});if(!response.ok)throw new Error("媒体文件暂时无法读取");const original=await response.arrayBuffer();if(original.byteLength<32)throw new Error("媒体文件内容为空");const responseType=response.headers.get("content-type")?.split(";")[0]?.trim();const blob=new Blob([original],{type:responseType||fresh.mimeType||"application/octet-stream"});return attachment.kind==="photo"?await photoBlobToJpegDataUrl(blob):await blobToDataUrl(blob);}
function triggerDownload(url:string,name:string){const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.hidden=true;document.body.appendChild(anchor);anchor.click();window.setTimeout(()=>anchor.remove(),0);}
function exportErrorMessage(error:unknown):string{const message=error instanceof Error?error.message:"";if(message.includes("过大"))return "文件太大，暂时无法整本保存；请减少单条视频数量后重试。";if(message.includes("媒体")||message.includes("照片"))return "有照片或影音暂时无法读取，请重新打开后再试。";return "保存失败，请稍后重试。";}
function importErrorMessage(error:unknown):string{const message=error instanceof Error?error.message:"";if(message.startsWith("导入")||message.includes("媒体")||message.includes("日期")||message.includes("人物")||message.includes("章节"))return message;if(message.includes("过大")||message.toLowerCase().includes("too large")||message.toLowerCase().includes("payload"))return "这份文件太大，暂时无法一次导入。";return "导入没有完成，请确认这是本应用导出的 JSON 后再试。";}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]??c));}

function PersonEditor({value,onClose,onSaved}:{value:Person|"new";onClose:()=>void;onSaved:(id:number)=>Promise<void>}) { const editing=value!=="new";const [name,setName]=useState(editing?value.name:"");const [relation,setRelation]=useState(editing?value.relationship:"自己");const [birth,setBirth]=useState(editing?(value.birthDate??""):"");const [bio,setBio]=useState(editing?value.bio:"");const [busy,setBusy]=useState(false);const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{if(editing){await api.updatePerson({id:value.id,name,relationship:relation,birthDate:birth||null,bio});await onSaved(value.id);}else{const r=await api.createPerson({name,relationship:relation,birthDate:birth||null,bio});await onSaved(r.id);}}finally{setBusy(false)}};return <Modal title={editing?"编辑人物":"建立人物档案"} onClose={onClose}><form className="form" onSubmit={submit}><label>姓名<input required value={name} onChange={e=>setName(e.target.value)} placeholder="要记录谁的一生"/></label><label>与我的关系<input required value={relation} onChange={e=>setRelation(e.target.value)} placeholder="自己、母亲、孩子…"/></label><label>出生日期 <small>可留空</small><input type="date" value={birth} onChange={e=>setBirth(e.target.value)}/></label><label>简介 <small>可留空</small><textarea rows={3} value={bio} onChange={e=>setBio(e.target.value)} placeholder="一句话介绍这个人"/></label><button className="primary full" disabled={busy}>{busy?"正在落笔…":"保存人物档案"}</button>{!editing&&<p className="form-note">保存后会建立“童年、求学、立业、成家、传承”五个可编辑章节。</p>}</form></Modal>}

function EventEditor({person,people,chapters,value,onClose,onSaved}:{person:Person;people:Person[];chapters:Archive["chapters"];value:LifeEvent|"new";onClose:()=>void;onSaved:()=>Promise<void>}) {
 const editing=value!=="new";const [title,setTitle]=useState(editing?value.title:"");const [mode,setMode]=useState<"exact"|"year">(editing?value.dateMode:"exact");const [date,setDate]=useState(editing?value.dateValue:todayLocal());const [chapter,setChapter]=useState<number|null>(editing?value.chapterId:(chapters[0]?.id??null));const [location,setLocation]=useState(editing?value.location:"");const [significance,setSignificance]=useState<(typeof labels)[number]>(editing?value.significance:"日常");const [body,setBody]=useState(editing?value.body:"");const [tags,setTags]=useState(editing?value.customTags.join("，"):"");const [related,setRelated]=useState<number[]>(editing?value.relatedPersonIds:[]);const [uploads,setUploads]=useState<Upload[]>([]);const [existingAttachments]=useState(editing?value.attachments:[]);const [removedAttachmentIds,setRemovedAttachmentIds]=useState<number[]>([]);const visibleAttachments=existingAttachments.filter(item=>!removedAttachmentIds.includes(item.id));const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [recording,setRecording]=useState(false);const [moreOpen,setMoreOpen]=useState(editing);
 const photos=async(e:ChangeEvent<HTMLInputElement>)=>{const files=Array.from(e.target.files??[]).slice(0,8);setBusy(true);try{const next=await Promise.all(files.map(compressImage));setUploads(v=>[...v,...next].slice(0,12));}catch{setError("照片处理失败，请换一张重试");}finally{setBusy(false);e.target.value=""}};
 const audioFile=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(file.size>13_000_000){setError("音频超过 13 MB，请选择较短的录音");return;}setBusy(true);try{const encoded=await fileToBase64(file);const next:Upload={kind:"audio",dataBase64:encoded.dataBase64,mimeType:file.type||"audio/mp4",fileName:file.name||`语音-${Date.now()}.m4a`};setUploads(v=>[...v,next].slice(0,12));setError("");}catch{setError("音频读取失败，请换一个文件重试");}finally{setBusy(false);e.target.value=""}};
 const videoFile=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(file.size>36_000_000){setError("视频超过 36 MB，请在相册中裁短后再添加");return;}setBusy(true);try{const encoded=await fileToBase64(file);const next:Upload={kind:"video",dataBase64:encoded.dataBase64,mimeType:file.type||"video/mp4",fileName:file.name||`视频-${Date.now()}.mp4`};setUploads(v=>[...v,next].slice(0,12));setError("");}catch{setError("视频读取失败，请换一个文件重试");}finally{setBusy(false);e.target.value=""}};
 const addTranscript=(transcript:string)=>{if(!transcript.trim())return;setBody(previous=>previous.trim()?`${previous.trim()}\n\n【语音转文字】\n${transcript.trim()}`:transcript.trim());};
 const submit=async(e:FormEvent)=>{e.preventDefault();setError("");if(mode==="year"&&!/^\d{4}$/.test(date)){setError("年份请填写四位数字");return;}const dateValue=mode==="year"?date.slice(0,4):date;const dateChangeConfirmed=value==="new"||dateValue!==value.dateValue||mode!==value.dateMode;setBusy(true);try{await api.saveEvent({id:editing?value.id:undefined,personId:person.id,chapterId:chapter,title,dateValue,dateMode:mode,dateChangeConfirmed,expectedUpdatedAt:editing?value.updatedAt:undefined,location,significance,body,customTags:tags.split(/[，,]/).map(x=>x.trim()).filter(Boolean),relatedPersonIds:related,uploads,removeAttachmentIds:removedAttachmentIds});await onSaved();}catch(error){const message=error instanceof Error?error.message:"";setError(message.includes("刚刚在别处更新过")?"这段回忆刚刚在别处更新过。请关闭编辑页，重新打开后再修改。":message.includes("日期")?message:"这件事还没有保存成功，请重试。");}finally{setBusy(false)}};
 return <Modal title={editing?"编辑这件事":"记一件事"} onClose={onClose} wide><form className="form event-form simple-event-form" onSubmit={submit}>
   {!editing&&<p className="quick-promise span-2">先写一句就够了，其他内容以后随时能补。</p>}
   <label className="span-2 quick-title">想记住什么？<input required autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：第一次带爸爸看海"/></label>
   <label className="span-2 quick-date">{mode==="year"?"约哪一年":"发生日期"}<input aria-label={mode==="year"?"约哪一年":"发生日期"} required type={mode==="year"?"number":"date"} min={mode==="year"?"1000":undefined} max={mode==="year"?"9999":undefined} value={date} onChange={e=>setDate(e.target.value)}/></label>
   <button type="button" className={`more-toggle span-2 ${moreOpen?"open":""}`} aria-expanded={moreOpen} onClick={()=>setMoreOpen(open=>!open)}><span><Icon name="more"/>更多内容</span><small>经过、照片、声音、视频、章节、地点和标签</small><Icon name="chevron" size={18}/></button>
   {moreOpen&&<div className="advanced-fields span-2">
     <fieldset><legend>日期精度</legend><div className="segmented"><button type="button" className={mode==="exact"?"active":""} onClick={()=>{setMode("exact");if(date.length===4)setDate(`${date}-01-01`)}}>完整日期</button><button type="button" className={mode==="year"?"active":""} onClick={()=>{setMode("year");setDate(date.slice(0,4))}}>只记年份</button></div></fieldset>
     <label>人生章节<select value={chapter??""} onChange={e=>setChapter(e.target.value?Number(e.target.value):null)}><option value="">未归档</option>{chapters.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
     <label className="span-2">补充经过 <small>可留空</small><textarea rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="发生了什么？当时有什么感受？"/></label>
     <fieldset className="span-2 media-field"><legend>照片、声音与视频 <small>可留空</small></legend><p className="field-help">录音会按设备支持的格式保存；支持时同步转成中文。视频可从相册选择或直接拍摄，单段不超过 36 MB。</p><div className="media-buttons"><label className="secondary"><Icon name="camera"/>添加照片<input type="file" accept="image/*" multiple onChange={photos}/></label><VoiceCapture onRecordingChange={setRecording} onCaptured={(upload,transcript)=>{setUploads(items=>[...items,upload].slice(0,12));addTranscript(transcript);}}/><label className="secondary"><Icon name="mic"/>选择音频<input type="file" accept="audio/*" onChange={audioFile}/></label><label className="secondary"><Icon name="video"/>添加视频<input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={videoFile}/></label></div>{removedAttachmentIds.length>0&&<p className="field-help">这些媒体会在你保存后才删除。直接关闭则原照片、语音和视频都还在。</p>}{visibleAttachments.length>0&&<div className="existing-media">{visibleAttachments.map(attachment=><div key={attachment.id}>{attachment.kind==="photo"?<OwnedPhoto attachment={attachment} alt="已保存的照片"/>:<MediaPlayback attachment={attachment} compact/>}<button type="button" onClick={()=>setRemovedAttachmentIds(ids=>ids.includes(attachment.id)?ids:[...ids,attachment.id])}>移除</button></div>)}</div>}{uploads.length>0&&<div className="upload-list">{uploads.map((u,i)=><div key={`${u.fileName}-${i}`} className={u.kind!=="photo"?"pending-media":""}><span>{u.kind==="photo"?"待保存照片":u.kind==="video"?"待保存视频":"待保存语音"} · {u.fileName}</span>{u.kind==="audio"&&<audio controls preload="metadata" src={`data:${u.mimeType};base64,${u.dataBase64}`}/>} {u.kind==="video"&&<video controls playsInline preload="metadata" src={`data:${u.mimeType};base64,${u.dataBase64}`}/>}<button type="button" onClick={()=>setUploads(v=>v.filter((_,n)=>n!==i))}>移除</button></div>)}</div>}</fieldset>
     <label>地点 <small>可留空</small><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="城市、家或某个地方"/></label>
     <fieldset><legend>这件事的意义</legend><div className="tag-picker">{labels.map(item=><button type="button" key={item} className={`${significance===item?"active":""} tag-${item}`} onClick={()=>setSignificance(item)}>{item}</button>)}</div></fieldset>
     <label className="span-2">相关人物 <small>可多选</small><div className="check-grid">{people.filter(p=>p.id!==person.id).map(p=><label key={p.id}><input type="checkbox" checked={related.includes(p.id)} onChange={()=>setRelated(v=>v.includes(p.id)?v.filter(id=>id!==p.id):[...v,p.id])}/>{p.name}</label>)}</div></label>
     <label className="span-2">自定义标签 <small>用逗号分隔</small><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="例如：第一次、上海、勇气"/></label>
   </div>}
   {error&&<p className="error span-2">{error}</p>}<button className="primary full span-2 save-event" disabled={busy||recording}>{busy?"正在稳妥保存…":editing?"保存修改":"保存这句话"}</button>
 </form></Modal>;
}
function EventDetail({event,people,chapter,onClose,onEdit,onDelete}:{event:LifeEvent;people:Person[];chapter:Archive["chapters"][number]|undefined;onClose:()=>void;onEdit:()=>void;onDelete:()=>void}) {return <Modal title={event.title} onClose={onClose} wide><article className="detail"><div className="detail-date">{textDate(event)}<span className={`tag tag-${event.significance}`}>{event.significance}</span></div>{chapter&&<p className="detail-chapter">第 {chapter.sortOrder+1} 章 · {chapter.title}</p>}{event.location&&<p className="detail-place">{event.location}</p>}<div className="prose">{event.body||<span className="muted">这件事还没有写下文字。</span>}</div>{event.attachments.filter(a=>a.kind==="photo").length>0&&<div className="photo-grid">{event.attachments.filter(a=>a.kind==="photo").map(a=><OwnedPhoto key={a.id} attachment={a} alt={`${event.title}的记录照片`}/>)}</div>}{event.attachments.filter(a=>a.kind==="audio"||a.kind==="video").map(a=><MediaPlayback key={a.id} attachment={a}/>)}{event.relatedPersonIds.length>0&&<p className="related">相关人物 · {event.relatedPersonIds.map(id=>people.find(p=>p.id===id)?.name).filter(Boolean).join("、")}</p>}{event.customTags.length>0&&<div className="custom-tags">{event.customTags.map(t=><span key={t}>#{t}</span>)}</div>}<footer><button className="secondary" onClick={onEdit}>编辑</button><button className="danger-quiet" onClick={onDelete}>删除这段回忆</button></footer></article></Modal>}

function ElderHome({person,onSaved,onMemories}:{person:Person;onSaved:()=>Promise<void>;onMemories:()=>void}) {
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState(`今天想为${person.name}留下什么？`);const [date,setDate]=useState(todayLocal());const [writing,setWriting]=useState(false);const [note,setNote]=useState("");const photoRef=useRef<HTMLInputElement|null>(null);const videoRef=useRef<HTMLInputElement|null>(null);
 const saveVoice=async(upload:Upload,transcript:string)=>{setBusy(true);setMessage("正在保存这段声音和文字…");try{await api.quickCapture({personId:person.id,title:transcript.trim()?transcript.trim().slice(0,60):"口述记录",dateValue:date,body:transcript.trim(),upload});await onSaved();setMessage(transcript.trim()?"声音和转写文字都已经收好了。":"这段声音已经收好了。");}catch{setMessage("没有保存成功，请再试一次。");throw new Error("voice save failed");}finally{setBusy(false)}};
 const photo=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setMessage("正在保存这张照片…");try{const up=await compressImage(file);await api.quickCapture({personId:person.id,title:"一张照片",dateValue:date,body:"",upload:up});await onSaved();setMessage("这张照片已经收好了。");}catch{setMessage("照片没有保存成功，请再试一次。");}finally{setBusy(false);e.target.value=""}};
 const video=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;if(file.size>36_000_000){setMessage("视频太大了，请在相册中裁短到 36 MB 以内。");e.target.value="";return;}setBusy(true);setMessage("正在保存这段视频…");try{const encoded=await fileToBase64(file);const up:Upload={kind:"video",dataBase64:encoded.dataBase64,mimeType:file.type||"video/mp4",fileName:file.name||`视频-${Date.now()}.mp4`};await api.quickCapture({personId:person.id,title:"一段视频",dateValue:date,body:"",upload:up});await onSaved();setMessage("这段视频已经收好了。");}catch{setMessage("视频没有保存成功，请再试一次。");}finally{setBusy(false);e.target.value=""}};
 const saveNote=async(e:FormEvent)=>{e.preventDefault();const text=note.trim();if(!text)return;setBusy(true);setMessage("正在保存这句话…");try{await api.quickCapture({personId:person.id,title:text.slice(0,80),dateValue:date,body:""});await onSaved();setNote("");setWriting(false);setMessage("这句话已经收好了。");}catch{setMessage("没有保存成功，请再试一次。");}finally{setBusy(false)}};
 return <main className="elder-home"><p className="elder-name">{person.name}</p><h1>{message}</h1><div className="elder-date"><label><span>这是哪一天的事？</span><input aria-label="记录发生日期" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button type="button" disabled={date===todayLocal()} onClick={()=>setDate(todayLocal())}>今天</button></div><div className="elder-actions"><VoiceCapture variant="elder" idleLabel="讲一段" activeLabel="说完了，保存" disabled={busy} onRecordingChange={value=>value&&setMessage("正在听你讲。说完后，再按一次红色按钮。")} onCaptured={saveVoice}/><button onClick={()=>setWriting(open=>!open)} disabled={busy} aria-expanded={writing}><Icon name="book" size={34}/><span>写一句</span></button><button onClick={()=>photoRef.current?.click()} disabled={busy}><Icon name="camera" size={34}/><span>拍一张</span></button><button onClick={()=>videoRef.current?.click()} disabled={busy}><Icon name="video" size={34}/><span>拍视频</span></button><button onClick={onMemories}><Icon name="river" size={34}/><span>看回忆</span></button><input ref={photoRef} hidden type="file" accept="image/*" capture="environment" onChange={photo}/><input ref={videoRef} hidden type="file" accept="video/*" capture="environment" onChange={video}/></div>{writing&&<form className="elder-note" onSubmit={saveNote}><label htmlFor="elder-note-input">写下最想记住的一句话</label><textarea id="elder-note-input" autoFocus rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="一句话就可以，随时还能再补。"/><div><button type="button" className="secondary" onClick={()=>{setWriting(false);setNote("")}}>取消</button><button className="primary" disabled={busy||!note.trim()}>{busy?"正在保存…":"保存这句话"}</button></div></form>}</main>
}
