import Link from "next/link";
import { getPublishedPeriods } from "@/lib/api";

export default async function HomePage() {
  let periods;
  try {
    periods = await getPublishedPeriods();
  } catch (e) {
    return (
      <main>
        <h1>SME Digest</h1>
        <p className="error-msg">
          Не удалось загрузить список периодов. Убедитесь, что бэкенд запущен и NEXT_PUBLIC_API_BASE_URL задан в .env.local
        </p>
      </main>
    );
  }

  return (
    <main className="landing-page">
      <header className="landing-hero">
        <div className="landing-hero-content">
          <p className="landing-eyebrow">SME DIGEST</p>
          <h1>Командный дайджест после завершения сбора активностей</h1>
          <p className="landing-lead">
            Здесь появляются только опубликованные выпуски: когда участники уже поделились фото и текстами
            про work и lifestyle, а период собран в финальный digest.
          </p>
        </div>
        <div className="landing-wall" aria-hidden="true">
          <article className="wall-card peach">
            <span>WORK</span>
            <strong>Wins & Experiments</strong>
          </article>
          <article className="wall-card sky">
            <span>LIFESTYLE</span>
            <strong>Moments & Energy</strong>
          </article>
          <article className="wall-card lemon">
            <span>FORMAT</span>
            <strong>Weekly Story Blocks</strong>
          </article>
          <article className="wall-card grape">
            <span>TEAM</span>
            <strong>Shared Highlights</strong>
          </article>
        </div>
      </header>

      <section className="landing-metrics">
        <p>Периоды публикуются после полного сбора материалов</p>
        <p>Каждый выпуск включает фото и тексты по 2 направлениям</p>
        <p>Переход в выпуск показывает детализацию по участникам</p>
      </section>

      <section>
        <h2 className="landing-section-title">Опубликованные выпуски</h2>
        <ul className="period-list">
          {periods.map((p) => (
            <li key={p.id}>
              <Link href={`/period/${p.id}`} className="period-list-item">
                <div>
                  <p className="period-title">
                    {p.year_month} - неделя {p.week_index}
                  </p>
                  <p className="period-meta">
                    Публикация: {new Date(p.publish_date).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <span className="period-cta">Открыть</span>
              </Link>
            </li>
          ))}
        </ul>
        {periods.length === 0 && (
          <p className="loading">Опубликованных периодов пока нет.</p>
        )}
      </section>
    </main>
  );
}
