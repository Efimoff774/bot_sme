import Link from "next/link";
import { getPeriodById } from "@/lib/api";
import { buildDevExtraParticipants } from "@/lib/devMockDigestParticipants";
import type { Participant } from "@/types/digest";
import PeriodSidebarNav from "./PeriodSidebarNav";
import PreviewableImage from "./PreviewableImage";

function getImageSrc(url: string): string {
  if (/^data:/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  const baseClean = base.replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${baseClean}${path}`;
}

export default async function PeriodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await getPeriodById(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка загрузки";
    if (msg === "Not found") {
      return (
        <main>
          <p className="not-found">Период не найден.</p>
          <p>
            <Link href="/">← К списку периодов</Link>
          </p>
        </main>
      );
    }
    return (
      <main>
        <p className="error-msg">{msg}</p>
        <p>
          <Link href="/">← К списку периодов</Link>
        </p>
      </main>
    );
  }

  const period = data?.period;
  let participants: Participant[] = Array.isArray(data?.participants) ? data.participants : [];
  if (process.env.NODE_ENV === "development") {
    const periodNum = Number(id);
    if (!Number.isNaN(periodNum)) {
      participants = [...participants, ...buildDevExtraParticipants(periodNum, 5)];
    }
  }

  if (!period) {
    return (
      <main>
        <p className="error-msg">Данные периода повреждены или отсутствуют.</p>
        <p>
          <Link href="/">← К списку периодов</Link>
        </p>
      </main>
    );
  }

  if (participants.length === 0) {
    return (
      <main>
        <p>
          <Link href="/">← К списку периодов</Link>
        </p>
        <h1>SME Digest</h1>
        <h2>
          {period.year_month} — неделя {period.week_index}
        </h2>
        <p className="loading">В этом периоде пока нет участников.</p>
      </main>
    );
  }

  const headingFonts = [
    "'Ruslan Display', serif",
    "'Lobster', cursive",
    "'Poiret One', sans-serif",
    "'Kelly Slab', cursive",
  ];

  /** Пять сеток фото (чередуются по участникам; «О работе» со сдвигом +2 — другой паттерн в том же выпуске). */
  const MEDIA_LAYOUT_MOD = 5;

  return (
    <main className="period-page">
      <section className="period-main">
        <p className="period-backline">
          <Link href="/">← К списку периодов</Link>
          <span>{period.year_month} — неделя {period.week_index}</span>
        </p>

        <div className="period-feed">
          {participants.map((part, idx) => {
            const userName = `${part.user.first_name} ${part.user.last_name}`;
            const lifePhotos = Array.isArray(part.lifestyle?.photos) ? part.lifestyle.photos : [];
            const workPhotos = Array.isArray(part.work?.photos) ? part.work.photos : [];
            const heroPhoto = part.user.avatar_url ?? null;
            const totalPhotos = lifePhotos.length + workPhotos.length;
            const participantGallery = [
              ...(heroPhoto ? [{ src: getImageSrc(heroPhoto), alt: `Аватар ${userName}` }] : []),
              ...lifePhotos.map((ph, i) => ({
                src: getImageSrc(ph.url),
                alt: `Lifestyle фото ${i + 1}`,
              })),
              ...workPhotos.map((ph, i) => ({
                src: getImageSrc(ph.url),
                alt: `Work фото ${i + 1}`,
              })),
            ];
            const galleryStartLife = heroPhoto ? 1 : 0;
            const galleryStartWork = galleryStartLife + lifePhotos.length;
            const layoutLife = idx % MEDIA_LAYOUT_MOD;
            const layoutWork = (idx + 2) % MEDIA_LAYOUT_MOD;

            return (
              <article
                key={part.user.id}
                id={`participant-${part.user.id}`}
                className="participant-story"
              >
                <header className="participant-header">
                  <p className="participant-order">Участник {idx + 1}</p>
                  <h2
                    id={`participant-title-${part.user.id}`}
                    className="period-hero-title"
                    style={{ fontFamily: headingFonts[idx % headingFonts.length] }}
                  >
                    {userName}
                  </h2>
                  <div className="period-tags">
                    <span className="period-tag">О жизни +{lifePhotos.length}</span>
                    <span className="period-tag">О работе +{workPhotos.length}</span>
                    <span className="period-tag">Фото +{totalPhotos}</span>
                  </div>
                </header>

                <div className="participant-split">
                  <div className="participant-visual-column">
                    <div className="participant-visual-sticky">
                      <div className="period-feature-image">
                        {heroPhoto ? (
                          <PreviewableImage
                            src={getImageSrc(heroPhoto)}
                            alt={`Фото участника ${userName}`}
                            gallery={participantGallery}
                            initialIndex={0}
                            className="period-hero-preview"
                          />
                        ) : (
                          <div className="period-feature-fallback">Нет изображения</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="participant-content-column">
                    <section className="story-section story-section--first">
                      <h3>О жизни</h3>
                      <p className="story-text">
                        {part.lifestyle.general_text?.trim() || "Пока без текстового описания."}
                      </p>
                      {lifePhotos.length > 0 ? (
                        <div className="media-grid" data-media-layout={layoutLife}>
                          {lifePhotos.map((ph, i) => (
                            <figure
                              key={`${part.user.id}-life-${i}`}
                              className="media-card"
                            >
                              <PreviewableImage
                                src={getImageSrc(ph.url)}
                                alt={`Lifestyle фото ${i + 1}`}
                                gallery={participantGallery}
                                initialIndex={galleryStartLife + i}
                                className="media-preview"
                              />
                            </figure>
                          ))}
                        </div>
                      ) : (
                        <p className="story-empty">Фотографий о жизни пока нет.</p>
                      )}
                    </section>

                    <section className="story-section">
                      <h3>О работе</h3>
                      <p className="story-text">
                        {part.work.general_text?.trim() || "Пока без текстового описания."}
                      </p>
                      {workPhotos.length > 0 ? (
                        <div className="media-grid" data-media-layout={layoutWork}>
                          {workPhotos.map((ph, i) => (
                            <figure
                              key={`${part.user.id}-work-${i}`}
                              className="media-card"
                            >
                              <PreviewableImage
                                src={getImageSrc(ph.url)}
                                alt={`Work фото ${i + 1}`}
                                gallery={participantGallery}
                                initialIndex={galleryStartWork + i}
                                className="media-preview"
                              />
                            </figure>
                          ))}
                        </div>
                      ) : (
                        <p className="story-empty">Фотографий о работе пока нет.</p>
                      )}
                    </section>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="period-sidebar">
        <p className="period-sidebar-title">Участники выпуска</p>
        <PeriodSidebarNav
          items={participants.map((part) => ({
            id: part.user.id,
            name: `${part.user.first_name} ${part.user.last_name}`,
            avatarUrl: part.user.avatar_url ? getImageSrc(part.user.avatar_url) : null,
          }))}
        />
      </aside>
    </main>
  );
}
