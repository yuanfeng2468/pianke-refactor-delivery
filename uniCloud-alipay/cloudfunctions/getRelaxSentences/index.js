'use strict'

const { ERROR_CODES } = require('pianke-common')

const FALLBACK_SENTENCES = [
  { text: '心之所向，素履以往。', author: '《诗经》', mood: '宁静' },
  { text: '面朝大海，春暖花开。', author: '海子', mood: '治愈' },
  { text: '愿你被这世界温柔以待。', author: '佚名', mood: '温暖' },
  { text: '山不在高，有仙则名。', author: '刘禹锡', mood: '哲思' },
  { text: '静以修身，俭以养德。', author: '诸葛亮', mood: '修身' },
  { text: '采菊东篱下，悠然见南山。', author: '陶渊明', mood: '闲适' },
  { text: '行到水穷处，坐看云起时。', author: '王维', mood: '豁达' },
  { text: '此心安处是吾乡。', author: '苏轼', mood: '安宁' },
  { text: '万物皆有裂痕，那是光照进的地方。', author: '莱昂纳德·科恩', mood: '希望' },
  { text: '岁月静好，现世安稳。', author: '张爱玲', mood: '宁静' }
]

function projectSentence(item = {}) {
  return {
    text: String(item.text || '').slice(0, 300),
    author: String(item.author || '佚名').slice(0, 80),
    mood: String(item.mood || '宁静').slice(0, 40)
  }
}

function shuffle(items) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

exports.main = async () => {
  try {
    const result = await uniCloud.database().collection('relax_sentences').limit(50).get()
    const sentences = (result.data || []).map(projectSentence).filter((item) => item.text)
    return {
      code: ERROR_CODES.SUCCESS,
      message: '金句查询成功',
      data: { 
        sentences: shuffle(sentences.length ? sentences : FALLBACK_SENTENCES),
        source: sentences.length ? 'database' : 'fallback',
        timestamp: Date.now()
      }
    }
  } catch (error) {
    console.error('[getRelaxSentences] failed', { message: error.message })
    return {
      code: ERROR_CODES.SUCCESS,
      message: '金句服务暂不可用，已返回默认文案',
      data: { sentences: shuffle(FALLBACK_SENTENCES) }
    }
  }
}
