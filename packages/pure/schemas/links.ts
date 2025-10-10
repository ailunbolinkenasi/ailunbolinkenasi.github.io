import { z } from 'astro/zod'

export const FriendLinksSchema = () =>
  z
    .object({
      logbook: z.array(
        z.object({
          date: z.string(),
          content: z.string()
        })
      ),
      applyTip: z.array(
        z.object({
          name: z.string(),
          val: z.string()
        })
      )
    })
    .default({
      logbook: [],
      applyTip: [
        { name: 'Name', val: 'Heartbeat Diary' },
        { name: 'Desc', val: 'Live and learn. 🌱' },
        { name: 'Link', val: 'https://blog.mletter.cn' },
        { name: 'Avatar', val: 'https://img13.360buyimg.com/ddimg/jfs/t1/339806/2/18159/60207/68e72b0aF0cd09e9e/f498b59838834b98.jpg' }
      ]
    })
    .describe('Friend links for your website.')
