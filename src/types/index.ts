export type EventStatus = 'draft' | 'active' | 'paused' | 'ended';

export interface EventSettings {
  require_name?: boolean;
  allow_anonymous?: boolean;
  show_live_results?: boolean;
}

export type ActivityType = 'poll' | 'word_cloud' | 'quiz';
export type ActivityStatus = 'draft' | 'active' | 'ended';

export type PollType =
  | 'single'
  | 'multiple'
  | 'yes_no'
  | 'rating'
  | 'ranking'
  | 'open_text';

export interface ActivitySettings {
  poll_type?: PollType;
  allow_multiple?: boolean;
  max_choices?: number;
  show_live_results?: boolean;
  allow_user_options?: boolean;
  timer_seconds?: number;
  quiz_state?: 'answering' | 'revealed' | 'leaderboard';
}

export interface IPollOption {
  _id?: string;
  id?: string;
  text: string;
  order_index: number;
}

export interface IQuizOption {
  _id?: string;
  id?: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}

export interface IQuizQuestion {
  _id?: string;
  id?: string;
  question_text: string;
  time_limit_sec: number;
  points: number;
  explanation?: string;
  order_index: number;
  options: IQuizOption[];
}
