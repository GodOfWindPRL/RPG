import { FormEvent, useState } from 'react';
import { login, register } from '../network/api';
import { useGameStore } from '../systems/gameStore';

export function AuthPanel() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const setToken = useGameStore((s) => s.setToken);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload = isRegister ? await register(email, password) : await login(email, password);
      setToken(payload.token);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      <h2>{isRegister ? 'Register' : 'Login'}</h2>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input value={password} type="password" onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
      <button type="submit">{isRegister ? 'Create account' : 'Enter world'}</button>
      <button type="button" onClick={() => setIsRegister((v) => !v)}>
        {isRegister ? 'Switch to Login' : 'Switch to Register'}
      </button>
      {error && <p>{error}</p>}
    </form>
  );
}
