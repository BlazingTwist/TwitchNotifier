const getPreviewUrl = (userName, width, height) =>
    `https://static-cdn.jtvnw.net/previews-ttv/live_user_${userName}-${width}x${height}.jpg`;
let hideOffline = false;
let hidePreviews = false;
let hideStreamersOnlineCount = false;

let fetchedStreamerStatus = undefined;

/**
 * @param {Settings} storage
 */
const fetchStreamerStatus = (storage) => {
  showLoadingSpinner();

  if (!storage.twitchStreams) {
    storage.twitchStreams = [[]];
    chrome.storage.sync.set({twitchStreams: storage.twitchStreams}, () => {
    });
  }

  let allStreamers = storage.twitchStreams.flatMap(tabStreamers => tabStreamers);
  if (allStreamers.length > 0) {
    chrome.runtime
        .sendMessage({
          action: 'fetchStreamerStatus',
          usernames: Array.from(
              new Set(allStreamers.map((s) => s.toLowerCase()))
          ),
        })
        .then((response) => {
          fetchedStreamerStatus = response;
          displayStreamerStatus();
        });
  } else {
    fetchedStreamerStatus = undefined;
    displayStreamerStatus();
  }
};

const updateSetBadgeText = (setBadgeText) => {
  chrome.runtime.sendMessage(
      {
        action: 'setBadgeText',
        setBadgeText,
      },
      () => {
      }
  );
};

const sortStreams = (streamA, streamB) => {
  if (streamA.channel && streamB.channel) {
    return streamB.viewers - streamA.viewers;
  } else if (streamA.channel && !streamB.channel) {
    return -1;
  } else if (!streamA.channel && streamB.channel) {
    return 1;
  }

  return 0;
};

const abbreviateViewerCount = (number) => {
  // regex to avoid trailing zeros
  return number >= 1e6
      ? (number / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
      : number >= 1e3
          ? (number / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
          : number;
};

const createStreamerEntry = (stream) => {
  if (!stream.channel) {
    if (hideOffline) {
      return '';
    }

    return `
      <div class="row streamer-offline">
        <div class="col-xs-12 no-padding">
          <i class='fa fa-times remove' data-username='${stream.username}'></i>
          <a class='offline twitch-link' href='http://twitch.tv/${stream.username}'>${stream.username}</a>
        </div>
      </div>
    `;
  } else {
    const imageDiv = `
      <div class="col-xs-6 no-padding">
        <img class="img-responsive" src="${getPreviewUrl(
        stream.username,
        320,
        180
    )}" />
      </div>
    `;

    return `
      <div class="row streamer-online">
        <div class="${
        hidePreviews ? 'col-xs-12 no-padding' : 'col-xs-6 no-padding'
    }">
          <i class='fa fa-times remove' data-username='${stream.username}'></i>
          <i class='fa fa-video-camera'></i>
          <a class='online twitch-link' href='http://twitch.tv/${
        stream.username
    }'>
            ${stream.user_name} - ${stream.channel.status}
          </a>
          <ul class="list-unstyled">
            <li>
              <i class="fa fa-gamepad"></i>
              ${stream.game}
            </li>
            <li>
              <i class="fa fa-users"></i>
              ${abbreviateViewerCount(stream.viewers)}
            </li>
            <li>
              <i class="fa fa-clock-o"></i>
              Live for ${dateFns.distanceInWordsToNow(stream.created_at)}
            </li>
          </ul>
        </div>
        ${hidePreviews ? '' : imageDiv}
      </div>
    `;
  }
};

const showLoadingSpinner = () => {
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('streamers').innerHTML = '';
}

const displayStreamerStatus = () => {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('streamers').innerHTML = '';
  if (!fetchedStreamerStatus) {
    document.getElementById('emptyState').classList.remove('hidden');
    return;
  }

  chrome.storage.sync.get('twitchStreams', (storage) => {
    /** {@type string[][]} */
    let twitchStreams = storage.twitchStreams;
    let streamsByTab = twitchStreams.map((tabStreamers) => {
      let tabStreamerSet = new Set(tabStreamers.map(s => s.toLowerCase()));
      return fetchedStreamerStatus.filter((stream) => tabStreamerSet.has(stream.username.toLowerCase()));
    });
    updateStreamerTabsDisplay(streamsByTab);
    updateStreamerListDisplay(streamsByTab);
  });
};

/**
 * @param {any[][]} streamsByTab
 */
const updateStreamerTabsDisplay = (streamsByTab) => {
  let tabPanel = document.getElementById('profile-tab-panel');
  for (let i = 0; i < tabPanel.children.length; i++) {
    let tabButton = tabPanel.children.item(i);
    let countStr = "";
    let numLive = streamsByTab[i].filter(stream => !!stream.channel).length;
    if (numLive > 0) {
      countStr = " (" + numLive + ")";
    }
    tabButton.innerHTML = tabNames[i] + countStr;
  }
}

/**
 * @param {any[][]} streamsByTab
 */
const updateStreamerListDisplay = (streamsByTab) => {
  if (currentTabIdx >= streamsByTab.length) {
    document.getElementById('emptyState').classList.remove('hidden');
    return;
  }

  document.getElementById('emptyState').classList.add('hidden');
  streamsByTab[currentTabIdx].sort(sortStreams)
      .forEach((stream) => {
        const html = createStreamerEntry(stream);

        const entry = document.createElement('li');
        entry.innerHTML = html;
        entry.setAttribute('data-username', stream.username);
        document.getElementById('streamers').appendChild(entry);
      });
}

/**
 * @typedef Settings
 * @property {boolean} hideOffline
 * @property {boolean} hidePreviews
 * @property {boolean} hideStreamersOnlineCount
 * @property {string[][]} twitchStreams
 * @property {string[]} tabNames
 */
/**
 * @param {function (Settings)} callback
 */
const getAllSettings = (callback) => {
  chrome.storage.sync.get(
      [
        'hideOffline',
        'hidePreviews',
        'hideStreamersOnlineCount',
        'twitchStreams',
        'tabNames',
      ],
      callback
  )
}

const exportSettings = () => {
  getAllSettings(storage => {
    let data = JSON.stringify(storage);
    console.log("got settings:");
    console.log(data);
    const filename = "Twitch-Stream-Notifier.json";

    let btn = document.createElement('a');
    btn.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(data)}`);
    btn.setAttribute('download', filename);
    btn.style.display = 'none';
    document.body.appendChild(btn);
    btn.click();
    document.body.removeChild(btn);
  });
};

const importSettings = () => {
  let input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', 'application/json');
  input.style.display = 'none';

  input.onchange = () => {
    if (input.files.length <= 0) {
      console.log("Import was aborted (received no file)");
      return;
    }

    input.files[0].text().then((dataStr) => {
      let data = JSON.parse(dataStr);
      chrome.storage.sync.set(
          data,
          () => {
            reapplySettings(data);
          }
      );
    })
  }

  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
};

const reapplySettings = (storage) => {
  hideOffline = storage.hideOffline;
  document.getElementById('hideOffline').checked = !hideOffline;

  hidePreviews = storage.hidePreviews;
  document.getElementById('hidePreviews').checked = !hidePreviews;

  hideStreamersOnlineCount = storage.hideStreamersOnlineCount;
  document.getElementById('hideStreamersOnlineCount').checked =
      !hideStreamersOnlineCount;

  if (storage.twitchStreams.length > 0 && typeof storage.twitchStreams[0] === 'string') {
    storage.twitchStreams = [storage.twitchStreams];
    chrome.storage.sync.set({twitchStreams: storage.twitchStreams});
  }

  reloadAllTabs(storage.tabNames);

  fetchStreamerStatus(storage);
}

let currentTabIdx = 0;
let tabNames = [];

/**
 * @param {string[]} newTabNames
 */
const reloadAllTabs = (newTabNames) => {
  document.getElementById('profile-tab-panel').innerHTML = '';
  if (!newTabNames) {
    newTabNames = ["Main"];
  }

  tabNames = [];
  for (let tabName of newTabNames) {
    createNewTab(tabName);
  }
  storeTabNames();
  onTabChanged(0);
}

const createNewTab = (tabName) => {
  const tabIdx = tabNames.length;
  tabNames.push(tabName);
  let tabPanel = document.getElementById('profile-tab-panel');
  let tabButton = document.createElement('button');
  tabButton.classList.add('btn', 'btn-primary');
  tabButton.addEventListener("click", () => onTabChanged(tabIdx))
  tabButton.innerHTML = tabName;
  tabPanel.appendChild(tabButton);
}

const storeTabNames = () => {
  chrome.storage.sync.set({tabNames: tabNames});
}

const onTabChanged = (newTabIdx) => {
  let tabPanel = document.getElementById('profile-tab-panel');
  for (let i = 0; i < tabPanel.children.length; i++) {
    let btn = tabPanel.children.item(i);
    if (i === newTabIdx) {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-info');
    } else {
      btn.classList.remove('btn-info')
      btn.classList.add('btn-primary');
    }
  }
  currentTabIdx = newTabIdx;
  displayStreamerStatus();
}

document.addEventListener('DOMContentLoaded', () => {
  getAllSettings(reapplySettings);

  document.getElementById('export-button').addEventListener('click', exportSettings);
  document.getElementById('import-button').addEventListener('click', importSettings);

  document.getElementById('fn-add-tab').addEventListener("click", () => {
    createNewTab(window.prompt("tab-name?", ""));
    storeTabNames();
  })

  document.getElementById('addForm').addEventListener('submit', (evt) => {
    evt.preventDefault();
    const user = document.getElementById('streamerUsername').value.toLowerCase();
    document.getElementById('streamerUsername').value = '';
    if (!user) {
      console.log("streamer input is falsy, ignored.");
      return;
    }

    chrome.storage.sync.get('twitchStreams', (storage) => {
      while (storage.twitchStreams.length <= currentTabIdx) {
        storage.twitchStreams.push([]);
      }
      /** @type {string[]} */
      let tabStreamers = storage.twitchStreams[currentTabIdx];
      if (tabStreamers.indexOf(user) >= 0) {
        console.log("streamer '" + user + "' was already added to this tab");
        return;
      }

      tabStreamers.push(user);
      chrome.storage.sync.set(
          {twitchStreams: storage.twitchStreams},
          () => {
            fetchStreamerStatus(storage);
          }
      );
    });
  });

  document.body.addEventListener('click', (evt) => {
    if (evt.target.nodeName === 'A') {
      if (evt.target.classList.contains('twitch-link')) {
        chrome.tabs.create({url: evt.target.getAttribute('href')});
        evt.preventDefault();
      }

      if (evt.target.classList.contains('remove-all')) {
        chrome.storage.sync.set({twitchStreams: [[]]}, () => {
          document.getElementById('emptyState').classList.remove('hidden');
          document.getElementById('streamers').innerHTML = '';
          chrome.action.setBadgeText({
            text: '',
          });
          chrome.action.setTitle({
            title: '',
          });
        });
      }
    }

    if (evt.target.classList.contains('remove')) {
      let parent = evt.target.parentElement;

      if (
          parent.classList.contains('col-xs-12') ||
          parent.classList.contains('col-xs-6')
      ) {
        parent = parent.parentElement.parentElement;
      }

      const streamer = evt.target.getAttribute('data-username');

      chrome.storage.sync.get('twitchStreams', (storage) => {
        const tabStreamers = storage.twitchStreams[currentTabIdx];
        const index = tabStreamers.findIndex(
            (item) => item.toLowerCase() === streamer.toLowerCase()
        );

        if (index >= 0) {
          tabStreamers.splice(index, 1);
        }

        chrome.storage.sync.set(
            {twitchStreams: storage.twitchStreams},
            () => {
              parent.remove();
              fetchStreamerStatus(storage);
            }
        );
      });
    }
  });

  document.getElementById('hideOffline').addEventListener('change', (evt) => {
    chrome.storage.sync.set({hideOffline: !evt.target.checked}, () => {
      hideOffline = !evt.target.checked;
      chrome.storage.sync.get('twitchStreams', fetchStreamerStatus);
    });
  });

  document.getElementById('hidePreviews').addEventListener('change', (evt) => {
    chrome.storage.sync.set({hidePreviews: !evt.target.checked}, () => {
      hidePreviews = !evt.target.checked;
      chrome.storage.sync.get('twitchStreams', fetchStreamerStatus);
    });
  });

  document
      .getElementById('hideStreamersOnlineCount')
      .addEventListener('change', (evt) => {
        chrome.storage.sync.set(
            {hideStreamersOnlineCount: !evt.target.checked},
            () => {
              hideStreamersOnlineCount = !evt.target.checked;
              updateSetBadgeText(evt.target.checked);
              chrome.storage.sync.get('twitchStreams', fetchStreamerStatus);
            }
        );
      });
});
