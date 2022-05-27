import { createApp, reactive } from 'vue';
import App from './App.vue';
import { errorString, FIFO } from '@45drives/cockpit-helpers';
import '@45drives/cockpit-css/src/index.css';
import { useSpawn, errorStringHTML } from '@45drives/cockpit-helpers';
import { lastPathStorageKey } from './keys';

import router from './router';

const notificationFIFO = reactive(new FIFO());

const errorHandler = (error, title = "System Error") => {
	console.error(error);
	const notificationObj = {
		title,
		body: "",
		show: true,
		timeout: 10000,
		actions: [],
		level: "error",
	}
	if (error instanceof Error && error?.message) {
		notificationObj.body = error.message;
	} else if (typeof error === "string") {
		notificationObj.body = error;
	} else if (error?.stderr) {
		notificationObj.body = error.stderr;
	} else {
		notificationObj.body = "An error occured, check the system console (CTRL+SHIFT+J) for more information.";
	}
	if (notificationFIFO.getLen() < 10)
		notificationFIFO.push(notificationObj);
	else
		throw error;
}

let lastValidRoutePath = null;
router.beforeEach(async (to, from) => {
	if (to.name === 'root')
		return `/browse${localStorage.getItem(lastPathStorageKey) ?? '/'}`;
	if (to.fullPath === lastValidRoutePath) {
		return true;
	}
	if (to.name === 'browse') {
		if (!to.params.path)
			return "/browse/"; // force / for opening root
		try {
			let realPath = (await useSpawn(['realpath', '--canonicalize-existing', to.params.path], { superuser: 'try' }).promise()).stdout.trim();
			if (to.params.path !== realPath)
				return `/browse${realPath}`;
			try {
				await useSpawn(['test', '-r', to.params.path, '-a', '-x', to.params.path], { superuser: 'try' }).promise();
			} catch {
				throw new Error(`Permission denied for ${to.params.path}`);
			}
		} catch (error) {
			if (from.name === undefined)
				return { name: 'errorRedirect', query: { title: "Error opening path", message: errorString(error), ...to.query } }
			errorHandler(errorStringHTML(error), "Failed to open path");
			return false;
		}
	}
	lastValidRoutePath = to.fullPath; // protect double-update from next line
	cockpit.location.go(to.fullPath); // needed to update URL in address bar
	return true;
})

const app = createApp(App, { notificationFIFO }).use(router);

app.config.errorHandler = (error) => errorHandler(error);

window.onerror = (...args) => errorHandler(args[4] ?? args[0]);

app.mount('#app');