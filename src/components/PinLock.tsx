import { useState } from 'react';
import { Numpad } from './Numpad';
import { verifyPin } from '../crypto';
import { db } from '../db';

interface Props {
  onUnlock: (key: CryptoKey) => void;
}

export function PinLock({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (finalPin: string) => {
    if (loading) return;
    setLoading(true);
    const [settings] = await db.settings.toArray();
    if (!settings) { setLoading(false); return; }

    const key = await verifyPin(finalPin, settings.salt, settings.verifierIv, settings.verifierCt);
    if (key) {
      onUnlock(key);
    } else {
      setError('Неверный PIN');
      setPin('');
      setLoading(false);
    }
  };

  return (
    <div className="screen center">
      <h1 className="app-title">ABCD Дневник</h1>
      <p className="subtitle">{loading ? 'Проверка...' : 'Введите PIN-код'}</p>
      {error && <p className="error-msg">{error}</p>}
      <Numpad value={pin} onChange={setPin} onSubmit={(final) => { setPin(final); handleSubmit(final); }} />
    </div>
  );
}
