import { Button } from "@/components/ui/Button";
import { CHESS_REWARD_CREDITS } from "@/lib/credits/constants";

/** Rendered in place of the chat input once credits hit zero (§5.2). */
export function ExhaustedState() {
  return (
    <div className="space-y-4 py-2 text-center">
      <p className="text-sm text-fg">You&apos;ve used all your JTB interactions.</p>
      <p className="text-sm text-fg-muted">Want {CHESS_REWARD_CREDITS} more?</p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button href="/chess">
          Beat James&apos;s Chess AI +{CHESS_REWARD_CREDITS}
        </Button>
        <span className="text-xs text-fg-subtle">or</span>
        <Button href="/contact" variant="secondary">
          Reach out to James
        </Button>
      </div>
    </div>
  );
}
