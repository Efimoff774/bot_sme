import { Router } from 'express';
import path from 'path';
import { getPublishedPeriods, getPeriodById } from '../db/digestPeriods.js';
import { getSubmittedByPeriodId } from '../db/participation.js';
import { getUserById } from '../db/users.js';
import {
  getByUserAndPeriod as getLifestyleByUserAndPeriod,
  getPhotosByUserAndPeriod as getLifestylePhotosByUserAndPeriod
} from '../db/lifestyleMedia.js';
import {
  getByUserAndPeriod as getWorkByUserAndPeriod,
  getPhotosByUserAndPeriod as getWorkPhotosByUserAndPeriod
} from '../db/workMedia.js';

const router = Router();

/** Never expose filesystem absolute paths; return only /uploads/... or relative. */
function safeAvatarUrl(url) {
  if (url == null || url === '') return null;
  const s = String(url);
  if (s.startsWith('/uploads')) return s;
  try {
    if (path.isAbsolute(s)) return null;
  } catch (_) {}
  return s;
}

/** Normalize period row to public list shape. */
function toPeriodListItem(row) {
  return {
    id: row.id,
    year_month: row.year_month,
    week_index: row.week_index,
    team_id: row.team_id,
    start_date: row.start_date,
    end_date: row.end_date,
    publish_date: row.publish_date
  };
}

/**
 * GET /api/periods
 * List published periods only. Ordered by year_month DESC, week_index DESC.
 */
router.get('/', async (_req, res) => {
  try {
    const rows = await getPublishedPeriods();
    const sorted = [...rows].sort((a, b) => {
      const ym = (a.year_month || '').localeCompare(b.year_month || '', undefined, { numeric: true });
      if (ym !== 0) return -ym;
      return (b.week_index ?? 0) - (a.week_index ?? 0);
    });
    const list = sorted.map(toPeriodListItem);
    res.json(list);
  } catch (err) {
    console.error('[api] GET /api/periods error', err);
    res.status(500).json({ error: 'Failed to load periods' });
  }
});

/**
 * GET /api/periods/:id
 * Single published period with full digest content. 404 if not found, 403 if not published.
 */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const period = await getPeriodById(id);
    if (!period) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (period.status !== 'published') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const participations = await getSubmittedByPeriodId(id);
    const participants = await Promise.all(
      participations.map(async (p) => {
        const user = await getUserById(p.user_id);
        const lifestyleRow = await getLifestyleByUserAndPeriod(p.user_id, id);
        const lifestylePhotos = await getLifestylePhotosByUserAndPeriod(p.user_id, id);
        const workRow = await getWorkByUserAndPeriod(p.user_id, id);
        const workPhotos = await getWorkPhotosByUserAndPeriod(p.user_id, id);

        return {
          user: user
            ? {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                team_id: user.team_id,
                avatar_url: safeAvatarUrl(user.avatar_url)
              }
            : null,
          lifestyle: {
            general_text: lifestyleRow?.general_text ?? null,
            photos: lifestylePhotos.map((r) => ({ url: r.media_url }))
          },
          work: {
            general_text: workRow?.general_text ?? null,
            photos: workPhotos.map((r) => ({ url: r.media_url }))
          },
          submitted_at: p.submitted_at ?? null
        };
      })
    );

    // Filter out participants whose user was missing (defensive)
    const validParticipants = participants.filter((p) => p.user != null);

    res.json({
      period: toPeriodListItem(period),
      participants: validParticipants
    });
  } catch (err) {
    console.error('[api] GET /api/periods/:id error', err);
    res.status(500).json({ error: 'Failed to load period' });
  }
});

export default router;
