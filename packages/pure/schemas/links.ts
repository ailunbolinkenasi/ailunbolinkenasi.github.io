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
        { name: 'Avatar', val: 'https://img13.360buyimg.com/ddimg/jfs/t1/239095/17/9691/19853/664d82dfF34a0990c/c4198876146be2d4.jpg' }
      ]
    })
    .describe('Friend links for your website.')
