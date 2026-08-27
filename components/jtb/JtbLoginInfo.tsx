import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { CHESS_REWARD_CREDITS, INITIAL_CREDITS } from "@/lib/credits/constants";

/** Shown on the auth pages when a visitor arrived from /jtb — why JTB needs an account. */
export function JtbLoginInfo() {
  return (
    <Card className="mt-6 max-w-prose">
      <CardHeader>
        <Tag domain="jtb">JTB</Tag>
        <CardTitle>Why sign in to use JTB?</CardTitle>
        <CardDescription>
          JTB is a per-account feature — new accounts get {INITIAL_CREDITS} free
          interactions, and beating James&apos;s chess AI earns{" "}
          {CHESS_REWARD_CREDITS} more, once per account. Your balance lives in
          the database, so signing in is how JTB knows who you are and how many
          interactions you have left. Sign in or create an account below and
          you&apos;ll land back on JTB, ready to chat.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
