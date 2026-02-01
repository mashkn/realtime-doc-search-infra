import { z } from "zod";
import { EventMeta } from "./base";

export const DocumentUpsertedV1 = z.object({
  type: z.literal("document.upserted"),
  meta: EventMeta.extend({
    schema_version: z.literal(1)
  }),
  data: z.object({
    document_id: z.string().uuid(),
    title: z.string(),
    body: z.string(),
    updated_at: z.string().datetime()
  })
});

export type DocumentUpsertedV1 = z.infer<typeof DocumentUpsertedV1>;
