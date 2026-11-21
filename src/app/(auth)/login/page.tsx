import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Bachat Record</h1>
          <p className="text-muted-foreground mt-1">Group Savings Tracker</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
