import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shared/AuthForm";
import { registerAction } from "@/lib/actions/auth";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { getAuth } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function RegisterPage() {
  const session = await getAuth().getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <MarketingNav />
      <div className="px-4 py-16">
        <AuthForm
          title="Create your account"
          subtitle="Start with as little as $500 after KYC."
          action={registerAction}
          submitLabel="Create account"
          mode="register"
        />
      </div>
    </div>
  );
}
