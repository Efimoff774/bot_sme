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
    <main>
      <h1>SME Digest</h1>
      <ul>
        {periods.map((p) => (
          <li key={p.id}>
            <Link href={`/period/${p.id}`} className="period-list-item">
              {p.year_month} — неделя {p.week_index}
            </Link>
          </li>
        ))}
      </ul>
      {periods.length === 0 && (
        <p className="loading">Опубликованных периодов пока нет.</p>
      )}
    </main>
  );
}
