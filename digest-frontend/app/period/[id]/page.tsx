import Link from "next/link";
import { getPeriodById } from "@/lib/api";

function getImageSrc(url: string): string {
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

  const { period, participants } = data;

  return (
    <main>
      <p>
        <Link href="/">← К списку периодов</Link>
      </p>
      <h1>SME Digest</h1>
      <h2>
        {period.year_month} — неделя {period.week_index}
      </h2>

      <section className="section">
        <h3>Участники</h3>
        {participants.length === 0 && (
          <p className="loading">В этом периоде пока нет участников.</p>
        )}
        {participants.map((part) => (
          <article key={part.user.id} className="participant">
            <div>
              {part.user.avatar_url ? (
                <img
                  src={getImageSrc(part.user.avatar_url)}
                  alt=""
                  className="avatar"
                />
              ) : null}
              <strong>
                {part.user.first_name} {part.user.last_name}
              </strong>
            </div>

            <div className="section">
              <h4>Lifestyle</h4>
              {part.lifestyle.general_text != null &&
              part.lifestyle.general_text !== "" ? (
                <p>{part.lifestyle.general_text}</p>
              ) : null}
              {part.lifestyle.photos.length > 0 ? (
                <div className="photos">
                  {part.lifestyle.photos.map((ph, i) => (
                    <img
                      key={i}
                      src={getImageSrc(ph.url)}
                      alt=""
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="section">
              <h4>Work</h4>
              {part.work.general_text != null && part.work.general_text !== "" ? (
                <p>{part.work.general_text}</p>
              ) : null}
              {part.work.photos.length > 0 ? (
                <div className="photos">
                  {part.work.photos.map((ph, i) => (
                    <img
                      key={i}
                      src={getImageSrc(ph.url)}
                      alt=""
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
