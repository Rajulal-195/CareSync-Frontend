import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { useLogin } from '@/features/auth/useAuth';
import { toApiError } from '@/api/client';
import { ROLE_HOME } from '@/utils/roles';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();
  const {
    register, handleSubmit, formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await login.mutateAsync(values);
      const from = (location.state as { from?: string } | null)?.from;
      // Only honour the saved path if it belongs to this user's role area.
      const home = ROLE_HOME[user.role];
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (e) {
      const err = toApiError(e);
      setFormError(
        err.status === 401 ? 'Incorrect email or password.'
          : err.status === 429 ? 'Too many attempts. Please wait a moment and try again.'
          : err.message,
      );
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-forest p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <img src="/logo-mark.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl" />
          <span className="text-xl font-semibold">CareSync</span>
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Calm, fast appointment management for your whole care team.</h2>
          <p className="mt-3 max-w-md text-sage">Scheduling, arrivals and consultations in one secure workspace.</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-sage"><ShieldCheck className="h-4 w-4" aria-hidden /> Role-based access · Session secured by HttpOnly cookies</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} noValidate className="card w-full max-w-md space-y-5 p-8" aria-labelledby="login-title">
          <img src="/logo.png" alt="CareSync — EMR & Appointment System" className="mx-auto h-28 w-auto" />
          <div>
            <h1 id="login-title" className="text-2xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm text-muted">Use your hospital staff account.</p>
          </div>

          {formError && (
            <Alert tone="error">{formError}</Alert>
          )}

          <TextField label="Email" type="email" autoComplete="username" placeholder="name@hospital.org" error={errors.email?.message} {...register('email')} />

          <div>
            <TextField
              label="Password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover">
              {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {show ? 'Hide password' : 'Show password'}
            </button>
          </div>

          <Button type="submit" loading={login.isPending} className="w-full">
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
