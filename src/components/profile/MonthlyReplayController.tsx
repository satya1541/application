import React, { useEffect, useState } from 'react';
import { ShortyReplayModal } from './ShortyReplayModal';
import { shouldShowMonthlyReplay, recordMonthlyReplayShown } from '@/services/monthlyReplayService';

export const MonthlyReplayController: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    shouldShowMonthlyReplay().then((shouldShow) => {
      if (shouldShow && isMounted) {
        // Wait 2.5 seconds after app startup so home screen loads smoothly first
        timer = setTimeout(() => {
          if (isMounted) {
            setVisible(true);
            recordMonthlyReplayShown();
          }
        }, 2500);
      }
    });

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleClose = () => {
    setVisible(false);
  };

  return <ShortyReplayModal visible={visible} onClose={handleClose} />;
};
