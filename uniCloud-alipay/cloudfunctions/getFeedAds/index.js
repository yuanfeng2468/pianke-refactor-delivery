'use strict'
const { 
  requireAuth, assertRequestedUid, ERROR_CODES, getBatchConfigs,
  getOperationString, stableId, now, getBusinessDate, checkRateLimit, AD_CONFIG, safeInt, addAdLog, requestId, AD_EVENTS
} = require('pianke-common')

function positiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, max)
}

exports.main = async (event = {}, context = {}) => {
  const requestedUid = String(event.uid || event.userId || '').trim()
  const page = positiveInt(event.page, 1, 100000)
  const pageSize = positiveInt(event.pageSize, 5, 20)
  const db = uniCloud.database()
  
  try {
    // 1. 并行鉴权与配置读取
    const [auth, configs] = await Promise.all([
      requireAuth(event, context),
      getBatchConfigs(['ad_enabled_feed', 'adpid_feed'], {
        ad_enabled_feed: true,
        adpid_feed: AD_CONFIG.FEED_AD.ADPID
      })
    ])

    const uid = assertRequestedUid(requestedUid, auth.uid)
    await checkRateLimit(`feed:get:${uid}`, 20, 60)
    const feedEnabled = configs.ad_enabled_feed !== false && configs.ad_enabled_feed !== 'false'
    const configuredAdpid = getOperationString(configs.adpid_feed, AD_CONFIG.FEED_AD.ADPID).trim()
    
    if (!feedEnabled || !configuredAdpid) {
      return { code: ERROR_CODES.SUCCESS, data: { ads: [], page, pageSize, hasMore: false } }
    }

    const timestamp = now()
    const businessDate = getBusinessDate(timestamp)

    // 2. 查询广告列表
    const adResult = await db.collection('feed_ads')
      .where({ is_active: true, adpid: configuredAdpid })
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
    
    const rawAds = adResult.data || []
    const ads = rawAds.filter(ad => ad && ad._id).map((ad, index) => {
      const sessionId = stableId('feed_sess', `${uid}:${ad._id}:${businessDate}:${page}:${index}`)
      const width = safeInt(ad.width, 0)
      const height = safeInt(ad.height, 0)
      const ratio = ad.aspect_ratio || (width > 0 && height > 0 ? width / height : 1.7778)
      
      return {
        id: String(ad._id),
        title: String(ad.title),
        description: String(ad.description),
        adpid: String(ad.adpid),
        slotId: String(ad.slot_id || ''),
        sessionId,
        mediaType: String(ad.media_type || 'image'),
        imageUrl: String(ad.image_url || ''),
        videoUrl: String(ad.video_url || ''),
        landingUrl: String(ad.landing_url || ''),
        width, height, aspectRatio: ratio,
        createdAt: safeInt(ad.created_at)
      }
    })

    if (ads.length > 0) {
      // 3. 统一签发完整 session；关键写入失败不得静默降级为空列表。
      const sessionCollection = db.collection('feed_exposure_session')
      for (const ad of ads) {
        const sessionKey = stableId('feed_session', ad.sessionId)
        const slotId = String(ad.slotId || '').trim()
        if (!slotId) throw new Error(`广告 ${ad.id} 缺少 slot_id`)
        try {
          const existingResult = await sessionCollection.doc(sessionKey).get()
          const existingSession = existingResult.data?.[0] || existingResult.data
          if (existingSession && safeInt(existingSession.expires_at) > timestamp && ['issued', 'active'].includes(String(existingSession.status))) {
            ad.sessionId = String(existingSession.session_id)
            continue
          }
          await sessionCollection.doc(sessionKey).set({
            _id: sessionKey,
            session_id: ad.sessionId,
            slot_id: slotId,
            user_id: uid,
            adpid: ad.adpid,
            scene: 'coin_page_feed',
            business_date: businessDate,
            page,
            status: 'issued',
            created_at: timestamp,
            expires_at: timestamp + 30 * 60 * 1000
          })
        } catch (writeError) {
          await addAdLog({
            user_id: uid,
            trace_id: requestId(event, context),
            event_type: AD_EVENTS.LOAD_FAILED,
            scene: 'coin_page_feed',
            placement_id: ad.adpid,
            status: 'error',
            detail: { session_id: ad.sessionId, error_stack: String(writeError.stack || writeError.message || writeError) }
          })
          throw writeError
        }
      }
    }

    return {
      code: ERROR_CODES.SUCCESS,
      message: 'success',
      data: {
        ads,
        page,
        pageSize,
        hasMore: ads.length === pageSize
      }
    }
  } catch (error) {
    console.error('[getFeedAds] failed', { request_id: requestId(event, context), error_stack: String(error.stack || error.message || error) })
    return { code: error.code || ERROR_CODES.SYSTEM_ERROR, message: '获取广告失败' }
  }
}
