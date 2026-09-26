"use client";

const LOCK_IMG = "https://i.ibb.co/M0d0b90/file-00000000761c820b8ab63dbcb68674f8.png";
const WELCOME_IMG = "https://i.ibb.co/PZ85sz4V/file-00000000888c81faaf389bdf2f54ade2.png";

const OWNER_TG = "5471930058";

function handleContactOwner() {
  const tg = (window as Window & { Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void; openLink?: (url: string) => void } } }).Telegram?.WebApp;
  const tgLink = "https://t.me/Thetpyinn7";

  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(tgLink);
      return;
    } catch (error) {
      console.warn("openTelegramLink failed, trying openLink", error);
    }
  }
  if (tg?.openLink) {
    try {
      tg.openLink(tgLink);
      return;
    } catch (error) {
      console.warn("openLink failed", error);
    }
  }
  window.location.href = tgLink;
}

export function VipLocked({ onClaim, claimMessage }: { onClaim?: () => void; claimMessage?: string | null }) {
  return (
    <div className="rounded-2xl border border-gold/40 bg-surface p-4 text-center shadow-[0_0_40px_-16px_var(--gold)]">
      <img
        src={LOCK_IMG}
        alt="VIP members only"
        className="mx-auto w-full rounded-xl object-cover"
      />
      <h2 className="mt-4 font-display text-lg font-bold text-gold">VIP Members Only</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        ဒီ signals တွေကို VIP member များသာ ကြည့်ရှုနိုင်ပါသည်။ VIP ရယူရန် owner ကို
        ဆက်သွယ်ပါ။
      </p>
      {onClaim && (
        <button type="button" onClick={onClaim} className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-gold/50 px-4 py-3 text-sm font-bold text-gold">
          Claim Daily 1 Hour Free VIP
        </button>
      )}
      {claimMessage && <p className="mt-2 text-xs text-muted-foreground">{claimMessage}</p>}
      <button
        type="button"
        onClick={handleContactOwner}
        className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 font-display text-sm font-bold uppercase tracking-widest text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Contact Owner for VIP
      </button>
      <a
        href="https://t.me/Thetpyinn7"
        onClick={(event) => {
          event.preventDefault();
          handleContactOwner();
        }}
        className="mt-3 inline-block font-display text-xs text-primary underline underline-offset-2"
      >
        @Thetpyinn7
      </a>
    </div>
  );
}

function remainingVipLabel(expiresAt: string | null) {
  if (!expiresAt) return "Unlimited access";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "VIP access expired";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `VIP (${days > 0 ? `${days}d ` : ""}${hours}h remaining — Until ${new Date(expiresAt).toLocaleDateString()})`;
}

export function VipWelcome({ expiresAt }: { expiresAt: string | null }) {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-gold/40 bg-surface text-center shadow-[0_0_40px_-16px_var(--gold)]">
      <img src={WELCOME_IMG} alt="VIP member welcome" className="w-full object-cover" />
      <div className="px-4 py-3">
        <p className="font-display text-sm font-bold text-gold">
          VIP member ဖြစ်ပါပြီ — ကြိုဆိုပါတယ်!
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {remainingVipLabel(expiresAt)}
        </p>
      </div>
    </div>
  );
}
