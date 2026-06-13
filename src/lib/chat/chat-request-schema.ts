import { z } from "zod";

const contentPartSchema = z.union([
  z.object({
    type: z.literal("text"),
    text: z.string()
  }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string()
    })
  })
]);

export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.union([
          z.string().trim().min(1).max(15 * 1024 * 1024),
          z.array(contentPartSchema)
        ])
      })
    )
    .min(1)
    .max(40),
  model: z.string().trim().max(180).optional(),
  temperature: z.number().min(0).max(2).optional(),
  searchMode: z.enum(["auto", "on", "off"]).optional()
});

export type ParsedChatRequestBody = z.infer<typeof chatRequestSchema>;
