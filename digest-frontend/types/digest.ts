export interface PeriodSummary {
  id: number;
  year_month: string;
  week_index: number;
  team_id: number;
  start_date: string;
  end_date: string;
  publish_date: string;
}

export interface Participant {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    team_id: number;
    avatar_url: string | null;
  };
  lifestyle: {
    general_text: string | null;
    photos: { url: string }[];
  };
  work: {
    general_text: string | null;
    photos: { url: string }[];
  };
  submitted_at: string | null;
}

export interface PeriodDetail {
  period: PeriodSummary;
  participants: Participant[];
}
