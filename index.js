const contentContainer = document.querySelector('.content');
const confirmContainer = document.querySelector('#confirm');
const routes = [
    { path: /^\//, view: newsList },
    { path: /^news\/(\d+)/, view: newsDetail }
];
let currentNewsList = [];

async function router() {
    const url = currentRoute();
    const route = routes.find(r => r.path.test(url));
    if (!route) {
        return render(notFound());
    }

    const match = route.path.exec(url);
    render(loading());
    render(await route.view(...match));
    clearConfirmDialog();
}

function render(htmlString) {
    contentContainer.innerHTML = htmlString;
}

function currentRoute() {
    return location.hash.slice(1) || '/';
}

function confirmUpdate(msg) {
    const container = document.createElement('div');
    const messageSpan = document.createElement('span');
    const yes = document.createElement('span');
    const no = document.createElement('span');
    yes.appendChild(document.createTextNode('Yes please!'));
    no.appendChild(document.createTextNode('No, let me be'));
    yes.className = 'clickable';
    no.className = 'clickable';
    messageSpan.appendChild(document.createTextNode(msg));
    container.appendChild(messageSpan);
    container.appendChild(yes);
    container.appendChild(no);
    const onClick = resolve => () => {
        container.remove();
        resolve();
    }

    return new Promise(reslove => {
        yes.addEventListener('click', onClick(() => reslove(true)));
        no.addEventListener('click', onClick(() => reslove(false)));
        confirmContainer.appendChild(container);
    });
}

function clearConfirmDialog() {
    // This may cause memory leaks in older browsers due to the event listeners
    confirmContainer.innerHTML = '';
}

function createNewsNode(news) {
    return `
        <section>
            <img src="${news.image}">
            <article>
                <a href="#news/${news.id}"><h2>${news.title}</h2></a>
                <p>${news.text}</p>
            </article>
        </section>
    `;
}

function isSameNewsList(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((article, i) => article.id === b[i].id);
}

async function fetchNews() {
    const response = await fetch('https://happy-news-nmnepmqeqo.now.sh');
    const newsList = await response.json();
    currentNewsList = newsList;
    return newsList;
}

async function detailNews(id) {
    const response = await fetch(`https://happy-news-nmnepmqeqo.now.sh/${id}`);
    return await response.json();
}

async function newsList() {
    const news = await fetchNews();
    return news.map(createNewsNode).join('');
}

async function newsDetail(_, id) {
    try {
        const newsFetch = detailNews(id);
        const timeout = new Promise(resolve => setTimeout(resolve, 3000, new Error('timeout')));
        const news = await Promise.race([newsFetch, timeout]).then(value => {
            if (value instanceof Error) {
                throw value;
            }
            return value;
        });
        return createNewsNode(news);
    } catch (error) {
        if (await registerSync('news-article-' + id)) {
            return 'Could not fetch the article, I will try to download the article in the background and notify you when the article is ready 🎉';
        } else {
            return 'Could not fetch the article :/';
        }
    }
}

async function registerSync(tag) {
    const hasNotificationPermission = await requestNotificationPermission();
    if (!hasNotificationPermission) {
        return false;
    }

    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(tag);
    return true;
}

function requestNotificationPermission() {
    return new Promise(resolve => {
        Notification.requestPermission(permission => resolve(permission === 'granted'));
    });
}

function notFound() {
    return '<p>404</p>';
}

function loading() {
    return '<p>Loading... 🚀</p>';
}

['hashchange', 'load'].forEach(e => window.addEventListener(e, router));

// SW

const apiCacheName = 'api-cache-v1';
const applicationServerKey = urlB64ToUint8Array('BLKDIREFdJjk63LMAhjpwoBWPASDs1zQdKt5ovo-RFbiL839I4DoqM-pyk0WkBNKAGwyTfAc-QMBqsPjkWZWKMI');

async function fromCache(request, cacheName) {
    const cache = await caches.open(cacheName);
    return cache.match(request);
}

async function messageHandler({ type, url }) {
    if (type === 'refresh-news-list' && currentRoute() === '/') {
        const cachedData = await fromCache(url, apiCacheName);
        if (!cachedData || !cachedData.ok) {
            return;
        }
        const newsList = await cachedData.json();
        const isNewList = !isSameNewsList(currentNewsList, newsList);
        if (isNewList && await confirmUpdate('Sorry to bother you but do you want the latest news?')) {
            render(newsList.map(createNewsNode).join(''));
        }
    }
}

navigator.serviceWorker.addEventListener('message', event => messageHandler(JSON.parse(event.data)));

function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function getPushSubscription() {
    const registration = await window.navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    }
    console.dir(JSON.stringify(subscription));
}
