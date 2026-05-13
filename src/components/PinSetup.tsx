import { useState } from 'react';
import { Numpad } from './Numpad';
import { setupPin } from '../crypto';
import { db } from '../db';

interface Props {
  onDone: () => void;
}

export function PinSetup({ onDone }: Props) {
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async (finalPin2: string) => {
    if (pin1 !== finalPin2) {
      setError('PIN не совпадает. Попробуйте снова.');
      setPin1('');
      setPin2('');
      setStep('enter');
      return;
    }
    const data = await setupPin(pin1);
    await db.settings.add(data);
    onDone();
  };

  if (step === 'enter') {
    return (
      <div className="screen center">
        <h1 className="app-title">ABCD Дневник</h1>
        <p className="subtitle">Придумайте PIN-код для защиты</p>
        {error && <p className="error-msg">{error}</p>}
        <Numpad value={pin1} onChange={setPin1} onSubmit={(final) => { setPin1(final); setStep('confirm'); }} />
      </div>
    );
  }

  return (
    <div className="screen center">
      <h1 className="app-title">ABCD Дневник</h1>
      <p className="subtitle">Повторите PIN-код</p>
      <Numpad value={pin2} onChange={setPin2} onSubmit={handleConfirm} />
    </div>
  );
}
