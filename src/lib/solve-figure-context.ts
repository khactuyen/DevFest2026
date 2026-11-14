import { z } from "zod";

// Images are transient inputs. Only small, explicitly unverified observations
// and a binding digest belong in a saved analysis, not the base64 image itself.
export const SolveFigureInputSchema = z.object({
  imageDataUrl: z.string().max(4_500_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/).optional(),
  description: z.string().trim().max(1200).default(""),
  ambiguities: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
}).strict();
export type SolveFigureInput = z.infer<typeof SolveFigureInputSchema>;
export const SolveFigureContextSchema = z.object({
  description: z.string().trim().max(1200),
  ambiguities: z.array(z.string().trim().min(1).max(300)).max(12),
  imageProvided: z.boolean(),
  imageDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
