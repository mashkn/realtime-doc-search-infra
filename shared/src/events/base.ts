import { z } from "zod";

export const EventMeta = z.object({
  event_id: z.string().uuid(),
  occurred_at: z.string().datetime(),
  producer: z.string(),
  schema_version: z.number().int().positive()
});

export type EventMeta = z.infer<typeof EventMeta>;
