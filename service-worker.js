// Service Worker for Goeri Alert Web Push Notifications

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// ── Web Push Event Listener ──────────────────
self.addEventListener('push', (event) => {
    let payload = {
        title: '🚨 괴리율 감지!',
        body: '조건을 만족하는 신규 코인이 스캔되었습니다.',
        url: 'https://www.bitget.com'
    };

    if (event.data) {
        try {
            payload = event.data.json();
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,
        icon: 'https://www.bitget.com/favicon.ico', // 파비콘을 아이콘으로 사용
        badge: 'https://www.bitget.com/favicon.ico',
        vibrate: [200, 100, 200],
        data: {
            url: payload.url
        },
        // 알림창 하단 액션 버튼 정의
        actions: [
            {
                action: 'confirm',
                title: '확인'
            },
            {
                action: 'go',
                title: '페이지 가기'
            }
        ],
        // 중요도 설정 (시스템에 따라 다르게 보임)
        requireInteraction: true // 사용자가 닫기 전까지 떠 있음
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

// ── Notification Click Event Listener ─────────
self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const action = event.action;
    const targetUrl = notification.data.url;

    // 알림창 닫기
    notification.close();

    if (action === 'go') {
        // [페이지 가기] 버튼을 누른 경우 비트겟 차트 탭 열기
        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                // 이미 동일한 주소의 창이 열려있는지 확인
                for (let i = 0; i < windowClients.length; i++) {
                    const client = windowClients[i];
                    if (client.url === targetUrl && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 없으면 새 창/새 탭으로 열기
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl);
                }
            })
        );
    }
    // 'confirm' 액션이거나 그냥 알림창 본체를 탭한 경우, 추가 동작 없이 알림만 닫힙니다.
});
