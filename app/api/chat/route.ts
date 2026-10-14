import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { type Content, type Part } from "@google/genai";
import { generateAnswer } from "@/lib/gemini";
import mammoth from "mammoth";
import { requestSchema, attachmentSchema, ownedPath, fileType } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
 if (!process.env.GEMINI_API_KEY) return NextResponse.json({error:"Set GEMINI_API_KEY on the server."}, {status:503});
 const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if (!token) return NextResponse.json({error:"Please sign in."}, {status:401});
 const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError} = await db.auth.getUser(token);
 if (authError || !user) return NextResponse.json({error:"Session expired. Please sign in again."}, {status:401});
 let body;
 try { if (Number(req.headers.get("content-length") || 0)>16000) throw Error(); body=requestSchema.parse(await req.json()); } catch { return NextResponse.json({error:"Invalid message. Limit: 12,000 characters and 3 attachments."},{status:400}); }
 const {data:conversation} = await db.from("conversations").select("id").eq("id",body.conversationId).eq("user_id",user.id).single();
 if (!conversation) return NextResponse.json({error:"Conversation not found."},{status:404});
 const {data:allowed,error:limitError} = await db.rpc("claim_chat_request");
 if (limitError || !allowed) return NextResponse.json({error:"Please wait 10 seconds between requests."},{status:429});
 try {
 const partsFor = async (text: string, raw: unknown): Promise<Part[]> => {
   const attachments = attachmentSchema.array().max(3).parse(raw);
   const parts: Part[] = [{text:text || "Analyze these attachments."}];
   for (const item of attachments) {
     if (!ownedPath(item.path,user.id,body.conversationId)) throw Error("Invalid attachment path.");
     const mime = fileType(item.path);
     const {data,error} = await db.storage.from("uploads").download(item.path);
     if (error || !data) throw Error("An attachment could not be read. Remove it or upload it again.");
     if (data.size > 5*1024*1024) throw Error("Files must be 5 MB or smaller.");
     const buffer=Buffer.from(await data.arrayBuffer());
     if (mime === "text/plain" || mime.includes("wordprocessingml")) {
       let value: string;
       try { value=mime === "text/plain" ? buffer.toString("utf8") : (await mammoth.extractRawText({buffer})).value; }
       catch { throw Error("Document could not be read. Please save it as a new DOCX or export it to PDF and upload again."); }
       if(!value.trim()) throw Error("Document has no readable text. Export it to PDF for image or scanned-page analysis.");
       if (value.length>80000) throw Error("Text documents must be under 80,000 characters.");
       parts.push({text:`Uploaded document: ${item.name}\n<document>\n${value}\n</document>`});
     } else { parts.push({text:`Attachment: ${item.name}`},{inlineData:{mimeType:mime,data:buffer.toString("base64")}}); }
   }
   return parts;
 };
 const {data:history,error:historyError}=await db.from("messages").select("role,content,attachments").eq("conversation_id",body.conversationId).order("created_at",{ascending:false}).limit(12);
 if(historyError) throw Error("Could not load chat history.");
 const contents: Content[]=[];
 let fileCount=body.attachments.length;
 // Keep at most 3 recent attachments in the context to bound memory and API cost.
 const selected=new Set<number>();
 for(let i=0;i<(history || []).length;i++) { const count=history![i].attachments.length; if(fileCount+count<=3){selected.add(i);fileCount+=count;} }
 for(let i=(history || []).length-1;i>=0;i--) { const m=history![i]; contents.push({role:m.role==="assistant"?"model":"user",parts:await partsFor(m.content,selected.has(i)?m.attachments:[])}); }
 contents.push({role:"user",parts:await partsFor(body.text,body.attachments)});
 const answer=await generateAnswer(contents);
 // Both messages are saved atomically after generation succeeds.
 const {error:saveError}=await db.rpc("save_chat_turn",{chat_id:body.conversationId,prompt:body.text,files:body.attachments,answer});
 if(saveError) throw Error("Response generated but not saved. Please retry.");
 return NextResponse.json({answer});
 } catch(error) {
 const message=error instanceof Error ? error.message : "Request failed.";
 const safe=/^(Document|Invalid attachment|An attachment|Files must|Text documents|Could not load|The model returned|Response generated)/.test(message);
 const providerStatus = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
 const providerMessage = providerStatus === 404 ? "The configured Gemini model is unavailable. Update GEMINI_MODEL and restart the app."
   : providerStatus === 429 ? "Gemini quota or rate limit reached. Check your Google AI Studio usage, then retry."
   : providerStatus === 504 ? "Gemini took too long to respond. Please retry with a shorter message or smaller file."
   : providerStatus === 503 ? "Gemini is temporarily unavailable. Please retry shortly."
   : providerStatus === 401 || providerStatus === 403 ? "Gemini rejected the server credentials. Check the API key and project permissions."
   : "AI request failed. Check the server key, model access, and Gemini quota, then retry.";
 return NextResponse.json({error:safe?message:providerMessage},{status:[429,503,504].includes(providerStatus) ? providerStatus : 502});
 }
}
