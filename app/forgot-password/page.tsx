import { AuthForm } from "@/components/shared/AuthForm";
import { forgotPasswordAction } from "@/lib/actions/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <div className="px-4 py-16">
        <AuthForm
          title="Reset password"
          subtitle="We'll log a reset link to the server console in local dev."
          action={forgotPasswordAction}
          submitLabel="Send reset link"
          mode="forgot"
        />
      </div>
    </div>
  );
}
