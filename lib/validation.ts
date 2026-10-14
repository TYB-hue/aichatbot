import { z } from "zod";
export const attachmentSchema = z.object({ path: z.string().max(250), name: z.string().min(1).max(150) });
export const requestSchema = z.object({ conversationId: z.uuid(), text: z.string().trim().max(12000), attachments: z.array(attachmentSchema).max(3) }).refine(v => v.text.length > 0 || v.attachments.length > 0);
export const types: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
export function fileType(name: string) { return types[name.split(".").pop()?.toLowerCase() || ""]; }
export function ownedPath(path: string, userId: string, conversationId: string) {
 return new RegExp(`^${userId}/${conversationId}/[a-f0-9-]{36}\\.(pdf|docx|txt|png|jpe?g|webp)$`).test(path);
}
