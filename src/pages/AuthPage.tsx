import { LoadingIndicator, Spinner } from '../components/ui/LoadingIndicator';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '../lib/supabase';
import { message } from '../lib/validation';
import { authRedirect, safeDestination } from '../features/auth/callback';
import { useAuth } from '../features/auth/AuthProvider';
type Mode = 'login' | 'signup' | 'reset' | 'update';
export function AuthPage({ mode }: { mode: Mode }) {
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const { session, loading, recovery } = useAuth();
  const location = useLocation(),
    navigate = useNavigate();
  const isReset = mode === 'reset',
    isUpdate = mode === 'update';
  const schema = z.object({
    email: isUpdate ? z.string() : z.email('Enter a valid email address.'),
    password: isReset
      ? z.string()
      : z
          .string()
          .min(
            mode === 'login' ? 1 : 8,
            mode === 'login'
              ? 'Enter your password.'
              : 'Use at least 8 characters.',
          ),
  });
  type Values = z.infer<typeof schema>;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  async function submit(values: Values) {
    setError('');
    setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error } = await db().auth.signUp({
          email: values.email,
          password: values.password,
          options: { emailRedirectTo: authRedirect() },
        });
        if (error) throw error;
        if (data.session) navigate('/library', { replace: true });
        else
          setNotice(
            'Check your email to confirm your account, then return here to sign in.',
          );
      }
      if (mode === 'login') {
        const { error } = await db().auth.signInWithPassword(values);
        if (error) throw error;
        navigate(safeDestination(location.state?.from), { replace: true });
      }
      if (isReset) {
        const { error } = await db().auth.resetPasswordForEmail(values.email, {
          redirectTo: authRedirect(true),
        });
        if (error) throw error;
        setNotice(
          'If an account exists for that address, a password reset link is on its way.',
        );
      }
      if (isUpdate) {
        const { error } = await db().auth.updateUser({
          password: values.password,
        });
        if (error) throw error;
        sessionStorage.removeItem('dogear-recovery');
        navigate('/library', { replace: true });
      }
    } catch (e) {
      setError(message(e));
    }
  }
  if (loading)
    return <LoadingIndicator>Checking your session…</LoadingIndicator>;
  if (isUpdate && (!session || !recovery))
    return (
      <section className="auth-card">
        <h1>Request a new reset link</h1>
        <p>Open the link in your password reset email to set a new password.</p>
        <Link to="/reset-password">Reset password</Link>
      </section>
    );
  if (session && (mode === 'login' || mode === 'signup'))
    return <Navigate to="/library" replace />;
  const title = {
    login: 'Welcome back.',
    signup: 'Begin your library.',
    reset: 'Find your way back.',
    update: 'A fresh start.',
  }[mode];
  return (
    <section className="auth-card">
      <p className="eyebrow">Your space for words</p>
      <h1>{title}</h1>
      <p className="muted">
        {
          {
            login: 'Your words are waiting for you.',
            signup: 'A few good words deserve a home.',
            reset: 'We’ll email you a link to reset your password.',
            update: 'Choose a new password for your library.',
          }[mode]
        }
      </p>
      <form
        name={`auth-${mode}`}
        onSubmit={handleSubmit(submit)}
        aria-busy={isSubmitting}
      >
        {!isUpdate && (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete={mode === 'login' ? 'username' : 'email'}
              {...register('email')}
              aria-invalid={!!errors.email}
              aria-describedby="email-error"
            />
            <p className="field-error" id="email-error">
              {errors.email?.message}
            </p>
          </>
        )}
        {!isReset && (
          <>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              {...register('password')}
              aria-invalid={!!errors.password}
              aria-describedby="password-error"
            />
            <p className="field-error" id="password-error">
              {errors.password?.message}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting && <Spinner />}
          {isSubmitting
            ? 'Please wait…'
            : {
                login: 'Sign in',
                signup: 'Create account',
                reset: 'Send reset link',
                update: 'Update password',
              }[mode]}
        </button>
      </form>
      {mode === 'login' && (
        <p>
          <Link to="/reset-password">Forgot password?</Link> ·{' '}
          <Link to="/signup">Create an account</Link>
        </p>
      )}
      {mode !== 'login' && (
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      )}
    </section>
  );
}
