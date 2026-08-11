// Web Dashboard App Logic

let serviceWorkerRegistration = null;
let isPushSubscribed = false;
let backendUrl = 'http://localhost:8000';
let statusInterval = null;
let vapidPublicKey = null;

// UI Elements
const apiUrlInput = document.getElementById('api-url');
const btnConnect = document.getElementById('btn-connect');
const btnPushToggle = document.getElementById('btn-push-toggle');
const pushStatusText = document.getElementById('push-status-text');
const scannerPulse = document.getElementById('scanner-pulse');

const statusScanner = document.getElementById('status-scanner');
const statusSymbols = document.getElementById('status-symbols');
const statusLastScan = document.getElementById('status-last-scan');
const statusTotalAlerts = document.getElementById('status-total-alerts');

const alertListContainer = document.getElementById('alert-list-container');
const feedUpdateTime = document.getElementById('feed-update-time');

// Load stored API Url
const storedUrl = localStorage.getItem('goeri_backend_url');
if (storedUrl) {
    backendUrl = storedUrl;
    apiUrlInput.value = storedUrl;
}

// ── Initialize Service Worker ────────────────
window.addEventListener('load', () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.register('service-worker.js')
            .then((registration) => {
                console.log('Service Worker registered successfully:', registration);
                serviceWorkerRegistration = registration;
                // 초기 상태 확인
                checkSubscriptionState();
            })
            .catch((error) => {
                console.error('Service Worker registration failed:', error);
            });
    } else {
        console.warn('Push messaging is not supported in this browser.');
        pushStatusText.textContent = '지원 불가';
        btnPushToggle.textContent = '브라우저 미지원';
    }
});

// ── Check Subscription State ─────────────────
function checkSubscriptionState() {
    if (!serviceWorkerRegistration) return;

    serviceWorkerRegistration.pushManager.getSubscription()
        .then((subscription) => {
            isPushSubscribed = !(subscription === null);
            updatePushUI(subscription);
        })
        .catch((err) => {
            console.error('Error getting subscription state:', err);
        });
}

// ── Update Push UI ───────────────────────────
function updatePushUI(subscription) {
    if (isPushSubscribed) {
        pushStatusText.textContent = '활성화됨';
        pushStatusText.className = 'status-badge status-enabled';
        btnPushToggle.textContent = '실시간 프로세스 중지 (알림 끄기)';
        btnPushToggle.className = 'btn btn-danger';
    } else {
        pushStatusText.textContent = '비활성화';
        pushStatusText.className = 'status-badge status-disabled';
        btnPushToggle.textContent = '백그라운드 푸시 알림 켜기';
        btnPushToggle.className = 'btn btn-primary';
    }
    btnPushToggle.disabled = !vapidPublicKey;
}

// ── Helper to convert VAPID Key ──────────────
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ── Fetch VAPID Key and Connect ──────────────
async function connectToBackend() {
    backendUrl = apiUrlInput.value.trim().replace(/\/$/, ''); // 끝에 슬래시 제거
    localStorage.setItem('goeri_backend_url', backendUrl);
    
    btnConnect.disabled = true;
    btnConnect.textContent = '연결 중...';

    try {
        // 1. VAPID Public Key 가져오기
        const res = await fetch(`${backendUrl}/api/vapid-public-key`);
        if (!res.ok) throw new Error('API request failed');
        const data = await res.json();
        vapidPublicKey = data.public_key;

        console.log('Connected to backend. VAPID key loaded.');
        
        btnConnect.textContent = '연결 성공 ✓';
        btnConnect.className = 'btn btn-secondary';
        btnPushToggle.disabled = false;
        
        // UI 갱신
        checkSubscriptionState();

        // 2. 주기적 모니터링 시작
        if (statusInterval) clearInterval(statusInterval);
        fetchSystemStatus();
        fetchAlertList();
        statusInterval = setInterval(() => {
            fetchSystemStatus();
            fetchAlertList();
        }, 10000);

    } catch (err) {
        console.error('Connection failed:', err);
        alert('백엔드 서버 연결 실패. 주소가 정확한지, 서버가 실행 중인지 확인하세요.');
        btnConnect.disabled = false;
        btnConnect.textContent = '서버 연결';
        btnConnect.className = 'btn btn-primary';
        btnPushToggle.disabled = true;
    }
}

btnConnect.addEventListener('click', connectToBackend);

// ── Push Toggle Action ───────────────────────
btnPushToggle.addEventListener('click', () => {
    if (isPushSubscribed) {
        unsubscribeUser();
    } else {
        subscribeUser();
    }
});

// ── Subscribe User for Push ──────────────────
async function subscribeUser() {
    if (!serviceWorkerRegistration || !vapidPublicKey) return;

    btnPushToggle.disabled = true;
    btnPushToggle.textContent = '등록 진행 중...';

    try {
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
        const subscription = await serviceWorkerRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });

        console.log('User is subscribed:', subscription);

        // 백엔드 서버에 구독 등록 요청
        const response = await fetch(`${backendUrl}/api/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subscription)
        });

        if (!response.ok) throw new Error('Failed to send subscription to backend');

        isPushSubscribed = true;
        updatePushUI(subscription);

    } catch (err) {
        console.error('Failed to subscribe user:', err);
        alert('알림 구독 설정 실패. 브라우저 알림 권한 허용 여부를 확인하세요.');
        checkSubscriptionState();
    }
}

// ── Unsubscribe User ─────────────────────────
async function unsubscribeUser() {
    if (!serviceWorkerRegistration) return;

    btnPushToggle.disabled = true;
    btnPushToggle.textContent = '해제 진행 중...';

    try {
        const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
        if (subscription) {
            // 백엔드 서버에 구독 해제 요청
            await fetch(`${backendUrl}/api/unsubscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subscription)
            });

            await subscription.unsubscribe();
            console.log('User is unsubscribed.');
            isPushSubscribed = false;
            updatePushUI(null);
        }
    } catch (err) {
        console.error('Error unsubscribing:', err);
        alert('알림 해제 진행 중 에러가 발생했습니다.');
        checkSubscriptionState();
    }
}

// ── Fetch Status & Alerts from Backend ───────
async function fetchSystemStatus() {
    try {
        const res = await fetch(`${backendUrl}/api/status`);
        if (!res.ok) return;
        const data = await res.json();

        const s = data.status;
        statusSymbols.textContent = `${s.symbols_count}개`;
        statusLastScan.textContent = s.last_scan || '없음';
        statusTotalAlerts.textContent = `${data.total_alerts}건`;

        if (s.is_scanning) {
            statusScanner.textContent = '스캔 진행 중';
            scannerPulse.className = 'pulse-dot scanning';
        } else {
            statusScanner.textContent = '대기(루프 대기)';
            scannerPulse.className = 'pulse-dot active';
        }
    } catch (err) {
        console.warn('Failed to fetch status:', err);
        statusScanner.textContent = '연결 지연';
        scannerPulse.className = 'pulse-dot';
    }
}

async function fetchAlertList() {
    try {
        const res = await fetch(`${backendUrl}/api/alerts?limit=50`);
        if (!res.ok) return;
        const data = await res.json();
        
        renderAlerts(data.alerts);
        feedUpdateTime.textContent = `업데이트: ${new Date().toLocaleTimeString()}`;
    } catch (err) {
        console.warn('Failed to fetch alerts:', err);
    }
}

// ── Render Alerts in feed ────────────────────
function renderAlerts(alerts) {
    if (!alerts || alerts.length === 0) {
        alertListContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📡</div>
                <p>수신된 괴리율 조건 만족 코인이 없습니다. 감지 대기 중...</p>
            </div>`;
        return;
    }

    alertListContainer.innerHTML = '';
    alerts.forEach((alert) => {
        const isShort = alert.type.includes('SHORT');
        const cardClass = isShort ? 'alert-item alert-short' : 'alert-item alert-long';
        const signalEmoji = isShort ? '📉' : '📈';

        const item = document.createElement('div');
        item.className = cardClass;
        
        // 카드 클릭 시 비트겟 차트 탭 열기
        item.onclick = () => window.open(alert.url, '_blank');

        item.innerHTML = `
            <div class="alert-header">
                <span class="symbol-name">${alert.symbol}</span>
                <span class="alert-badge-tf">${alert.timeframe}</span>
            </div>
            <div class="signal-type">${signalEmoji} ${alert.type}</div>
            <div class="alert-body">
                <div class="alert-details">
                    <div class="detail-item"><span>종가</span><span>${alert.close}</span></div>
                    <div class="detail-item"><span>거래량</span><span>${alert.volume} (${alert.vol_ratio}x)</span></div>
                    <div class="detail-item"><span>밴드 상단</span><span>${alert.upper_bb}</span></div>
                    <div class="detail-item"><span>밴드 하단</span><span>${alert.lower_bb}</span></div>
                </div>
                <div class="alert-time">${alert.time.split(' ')[1]}</div>
            </div>
        `;
        alertListContainer.appendChild(item);
    });
}
