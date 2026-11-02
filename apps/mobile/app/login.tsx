import { useState } from 'react';
import { router } from 'expo-router';
import { LockKeyhole, ShieldCheck, Mail, KeyRound } from 'lucide-react-native';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { setActiveRole, setSubdomain } from '@/lib/session';
import { Button } from '@/components/Button';
import { GlassCard } from '@/components/GlassCard';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { fonts, spacing, type, useTheme } from '@/theme/theme';

export default function SuperAdminLoginScreen() {
  const { colors, accent } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState(false);
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(user: { role?: string; mustChangePassword?: boolean } | undefined) {
    if (user?.role !== 'superAdmin') {
      await authClient.signOut();
      setError('This account does not have platform administrator access.');
      setChallenge(false);
      return;
    }
    if (user.mustChangePassword) {
      setError('Your password must be changed before using the platform portal. Please complete this step on the secure web portal.');
      return;
    }
    await setSubdomain(null);
    await setActiveRole(null);
    router.replace('/(superadmin)');
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!challenge) {
        const result = await authClient.signIn.email({ email: email.trim().toLowerCase(), password });
        if (result.error) {
          setError(result.error.message || 'Sign-in failed. Check your credentials.');
          return;
        }
        if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
          setChallenge(true);
          setPassword('');
          return;
        }
        await finish(result.data?.user as { role?: string; mustChangePassword?: boolean } | undefined);
      } else {
        const result = backup
          ? await authClient.twoFactor.verifyBackupCode({ code: code.replace(/[\\s-]/g, '') })
          : await authClient.twoFactor.verifyTotp({ code: code.replace(/\\s/g, '') });
        if (result.error) {
          setError(result.error.message || 'The verification code was not accepted.');
          setCode('');
          return;
        }
        await finish(result.data?.user as { role?: string; mustChangePassword?: boolean } | undefined);
      }
    } catch {
      setError('Unable to reach SchoolHub. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Platform access" subtitle="Secure sign-in for SchoolHub administrators">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl }}>
          <View style={{ width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <ShieldCheck size={34} color={colors.primaryForeground} />
          </View>
          <Text style={[type.title, { color: colors.foreground, marginTop: spacing.lg }]}>SchoolHub</Text>
          <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 4 }]}>PLATFORM ADMINISTRATION</Text>
        </View>
        <GlassCard padding={20} strong>
          <Text style={[type.title, { color: colors.foreground, marginBottom: 6 }]}>
            {challenge ? 'Verify it’s you' : 'Welcome back'}
          </Text>
          <Text style={[type.caption, { color: colors.mutedForeground, marginBottom: spacing.xl }]}>
            {challenge ? 'Enter the current code from your authenticator app.' : 'Sign in with your platform administrator account.'}
          </Text>
          {!challenge ? (
            <>
              <TextField label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="admin@schoolhub.com" icon={<Mail size={18} color={colors.mutedForeground} />} />
              <View style={{ height: spacing.lg }} />
              <TextField label="Password" value={password} onChangeText={setPassword} secret autoComplete="current-password" textContentType="password" placeholder="Enter your password" icon={<LockKeyhole size={18} color={colors.mutedForeground} />} />
            </>
          ) : (
            <>
              <TextField label={backup ? 'Backup code' : 'Authenticator code'} value={code} onChangeText={setCode} keyboardType={backup ? 'default' : 'number-pad'} maxLength={backup ? 16 : 6} placeholder={backup ? 'Enter backup code' : '000000'} icon={<KeyRound size={18} color={colors.mutedForeground} />} />
              <Text onPress={() => { setBackup(v => !v); setCode(''); setError(null); }} style={{ color: accent, fontFamily: fonts.semibold, marginTop: spacing.md }}>
                {backup ? 'Use authenticator code' : 'Use a backup code'}
              </Text>
            </>
          )}
          {error ? <Text accessibilityRole="alert" style={[type.caption, { color: colors.destructive, marginTop: spacing.md }]}>{error}</Text> : null}
          <View style={{ height: spacing.xl }} />
          <Button label={busy ? 'Please wait…' : challenge ? 'Verify and continue' : 'Sign in securely'} loading={busy} disabled={busy || (!challenge && (!email.trim() || !password)) || (challenge && code.trim().length < (backup ? 8 : 6))} onPress={() => void submit()} />
          {challenge ? <Text onPress={() => { setChallenge(false); setCode(''); setError(null); }} style={[type.caption, { color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.lg }]}>Back to sign in</Text> : null}
        </GlassCard>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: spacing.xl }}>
          <LockKeyhole size={13} color={colors.mutedForeground} />
          <Text style={[type.caption, { color: colors.mutedForeground }]}>Protected by secure authentication and two-factor verification</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
