import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as zxcvbnCommon from "@zxcvbn-ts/language-common";

const SECONDS_PER_DAY = 86400;
const ZXCVBN_MAX_PASSWORD_LENGTH = 72;
const LITERAL_USER_INPUTS = ["Untangled", "itsm"] as const;

const zxcvbn = new ZxcvbnFactory({
  graphs: zxcvbnCommon.adjacencyGraphs,
  dictionary: { ...zxcvbnCommon.dictionary },
});

function build_user_inputs(username: string, display_name: string): string[] {
  const inputs: string[] = [];
  const user = username.trim();
  if (user) {
    inputs.push(user);
  }
  for (const segment of display_name.split(/\s+/).filter(Boolean)) {
    if (segment.length >= 3) {
      inputs.push(segment);
    }
  }
  inputs.push(...LITERAL_USER_INPUTS);
  return inputs;
}

function crack_time_ratio(
  password: string,
  args: {
    user_inputs: string[];
    guess_per_second: number;
    acceptable_crack_time_days: number;
  },
): number {
  if (password === "") {
    return 0;
  }
  const scored = password.slice(0, ZXCVBN_MAX_PASSWORD_LENGTH);
  const result = zxcvbn.check(scored, args.user_inputs);
  const guesses_per_second = Math.max(Math.trunc(args.guess_per_second), 1);
  const acceptable_days = Math.max(
    Math.trunc(args.acceptable_crack_time_days),
    1,
  );
  const crack_time_days =
    result.guesses / guesses_per_second / SECONDS_PER_DAY;
  return crack_time_days / acceptable_days;
}

function classify_ok(ratio: number): boolean {
  return ratio >= 1;
}

/** True when strength is acceptable or strong (same buckets as Python). */
export function password_strength_ok(
  password: string,
  args: {
    username: string;
    display_name: string;
    guess_per_second: number;
    acceptable_crack_time_days: number;
  },
): boolean {
  const ratio = crack_time_ratio(password, {
    user_inputs: build_user_inputs(args.username, args.display_name),
    guess_per_second: args.guess_per_second,
    acceptable_crack_time_days: args.acceptable_crack_time_days,
  });
  return classify_ok(ratio);
}
