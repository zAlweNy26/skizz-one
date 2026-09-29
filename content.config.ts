import { defineCollection, defineContentConfig, z } from '@nuxt/content'

export default defineContentConfig({
  collections: {
    terms: defineCollection({
      type: 'page',
      source: 'terms/*.md',
      schema: z.object({
        updated: z.date(),
      }),
    }),
    credits: defineCollection({
      type: 'page',
      source: 'credits/*.md',
    }),
    changelog: defineCollection({
      type: 'page',
      source: 'changelog/**/*.md',
      schema: z.object({
        version: z.string(),
        date: z.date(),
      }),
    }),
  },
})
