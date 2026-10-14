"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import { browserClient } from "@/lib/supabase";
import { fileType } from "@/lib/validation";
type Attachment={path:string;name:string};
type Message={id:string;role:string;content:string;attachments:Attachment[]};
type ChatRow={id:string;title:string};
export default function Chat() {
 const db=useRef<SupabaseClient|null>(null);
 const authUserId=useRef<string|null>(null);
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[error,setError]=useState("");
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[register,setRegister]=useState(false),[notice,setNotice]=useState("");
 const [chats,setChats]=useState<ChatRow[]>([]),[active,setActive]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]);
 const [text,setText]=useState(""),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false);
 const bottom=useRef<HTMLDivElement>(null),fileInput=useRef<HTMLInputElement>(null),loadVersion=useRef(0);
 useEffect(()=>{
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY){setError("Configure .env.local using .env.example, then restart the app.");setReady(true);return;}
 db.current=browserClient();
 db.current.auth.getSession().then(({data})=>{authUserId.current=data.session?.user.id || null;setUser(data.session?.user || null);setReady(true);});
 const {data}=db.current.auth.onAuthStateChange((_event,session)=>{const nextId=session?.user.id || null;setUser(session?.user || null);if(authUserId.current!==nextId){authUserId.current=nextId;setActive(null);setMessages([]);setChats([]);setFiles([]);setText("");loadVersion.current++;}});
 return ()=>data.subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(user) void refreshChats();},[user]); // eslint-disable-line
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[messages,busy]);
 async function refreshChats(){const {data,error}=await db.current!.from("conversations").select("id,title").order("created_at",{ascending:false});if(error) setError(error.message);else setChats(data || []);}
 async function selectChat(id:string){if(busy)return;const version=++loadVersion.current;setActive(id);setMessages([]);setFiles([]);setText("");setError("");const {data,error}=await db.current!.from("messages").select("*").eq("conversation_id",id).order("created_at");if(version!==loadVersion.current)return;if(error)setError(error.message);else setMessages(data || []);}
 async function authenticate(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setNotice("");try{
 const result=register?await db.current!.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}}):await db.current!.auth.signInWithPassword({email,password});
 if(result.error)throw result.error;if(register && !result.data.session)setNotice("Check your email to confirm your account, then sign in.");
 }catch(e){setError(e instanceof Error?e.message:"Sign in failed.");}finally{setBusy(false);}}
 async function send(e:React.FormEvent){e.preventDefault();if(busy || (!text.trim()&&!files.length))return;setBusy(true);setError("");const uploaded:Attachment[]=[];let saved=false;
 try{
 let id=active;
 if(!id){const {data,error}=await db.current!.from("conversations").insert({user_id:user!.id,title:text.trim().slice(0,60)||files[0]?.name||"New conversation"}).select("id").single();if(error)throw error;id=data.id as string;setActive(id);await refreshChats();}
 for(const file of files){const ext=file.name.split(".").pop()!.toLowerCase();const path=`${user!.id}/${id}/${crypto.randomUUID()}.${ext}`;const {error}=await db.current!.storage.from("uploads").upload(path,file,{contentType:fileType(file.name),upsert:false});if(error)throw error;uploaded.push({path,name:file.name});}
 const {data}=await db.current!.auth.getSession();
 const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session?.access_token}`},body:JSON.stringify({conversationId:id,text:text.trim(),attachments:uploaded})});
 const result=await response.json();if(!response.ok)throw Error(result.error || "Request failed.");saved=true;
 const {data:rows,error}=await db.current!.from("messages").select("*").eq("conversation_id",id).order("created_at");if(error)throw error;setMessages(rows || []);setText("");setFiles([]);if(fileInput.current)fileInput.current.value="";
 }catch(e){setError(e instanceof Error?e.message:"Request failed.");if(!saved && uploaded.length)await db.current!.storage.from("uploads").remove(uploaded.map(f=>f.path));}finally{setBusy(false);}}
 async function deleteChat(){if(!active || busy)return;setBusy(true);setError("");try{
 const {data,error}=await db.current!.from("messages").select("attachments").eq("conversation_id",active);if(error)throw error;
 const paths=(data || []).flatMap(m=>(m.attachments as Attachment[]).map(a=>a.path));
 if(paths.length){const {error}=await db.current!.storage.from("uploads").remove(paths);if(error)throw error;}
 const {error:removeError}=await db.current!.from("conversations").delete().eq("id",active);if(removeError)throw removeError;
 setActive(null);setMessages([]);setFiles([]);await refreshChats();
 }catch(e){setError(e instanceof Error?e.message:"Delete failed.");}finally{setBusy(false);}}
 if(!ready)return <main className="auth"><p>Opening your workspace…</p></main>;
 if(!user)return <main className="auth"><section className="auth-card"><div className="brand">✳ Orbit</div><div className="eyebrow">YOUR PERSONAL AI WORKSPACE</div><h1>A little clarity.<br/>A lot of possibility.</h1><p>Think out loud. Explore your documents. Bring your ideas together.</p><form onSubmit={authenticate}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" minLength={8} autoComplete={register?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy || !db.current}>{busy?"Please wait…":register?"Create account":"Sign in"}</button></form><button className="link" onClick={()=>setRegister(!register)}>{register?"Already have an account? Sign in":"New here? Create an account"}</button>{notice&&<p role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}</section></main>;
 return <main className="workspace"><aside><div className="brand">✳ Orbit</div><button className="new-chat" disabled={busy} onClick={()=>{loadVersion.current++;setActive(null);setMessages([]);setText("");setFiles([]);setError("");}}>＋ New conversation</button><div className="eyebrow">YOUR CONVERSATIONS</div><nav>{chats.map(c=><button disabled={busy} className={active===c.id?"selected":""} key={c.id} onClick={()=>void selectChat(c.id)}>◌ {c.title}</button>)}</nav><div className="account"><span>{user.email}</span><button disabled={busy} onClick={()=>void db.current!.auth.signOut()}>Sign out ↗</button></div></aside><section className="chat"><header><span>Personal workspace <span className="badge">Gemini</span></span>{active&&<button disabled={busy} onClick={()=>void deleteChat()}>Delete chat</button>}</header><div className="thread">{!messages.length?<section className="welcome"><div className="orb">✳</div><div className="eyebrow">A SPACE TO THINK</div><h1>What’s on your mind?</h1><p>Ask a question, upload a document, or explore an image.</p><div className="suggestions">{["Help me plan my week","Explain a complex idea simply","Summarize my uploaded document"].map(s=><button key={s} disabled={busy} onClick={()=>setText(s)}>{s} ↗</button>)}</div></section>:messages.map(m=><article className={`message ${m.role}`} key={m.id}><div className="speaker">{m.role==="user"?"You":"✳ Orbit"}</div><ReactMarkdown>{m.content}</ReactMarkdown>{m.attachments?.map(a=><span className="file-tag" key={a.path}>↳ {a.name}</span>)}</article>)}{busy&&<p role="status" className="thinking">✳ Working on it…</p>}<div ref={bottom}/></div><div className="composer-wrap">{error&&<p className="error" role="alert">{error}</p>}<form onSubmit={send} className="composer"><div className="attachments">{files.map((f,i)=><button type="button" disabled={busy} key={i} onClick={()=>setFiles(files.filter((_,j)=>i!==j))}>{f.name} ×</button>)}</div><textarea aria-label="Message" placeholder="Ask anything, or add a file…" maxLength={12000} value={text} disabled={busy} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send(e);}}}/><div className="composer-actions"><label className="upload">＋ Attach files<input ref={fileInput} type="file" multiple disabled={busy} accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={e=>{const chosen=Array.from(e.target.files || []);if(chosen.length>3 || chosen.some(f=>!fileType(f.name)||f.size>5*1024*1024||f.name.length>150)){setError("Choose up to 3 supported files, each up to 5 MB, with names under 150 characters.");e.target.value="";return;}setFiles(chosen);setError("");}}/></label><button className="primary" disabled={busy||(!text.trim()&&!files.length)}>Send ↑</button></div></form><p className="footnote">PDF, DOCX, TXT & images · Up to 3 files, 5 MB each · AI can make mistakes.</p></div></section></main>;
}
