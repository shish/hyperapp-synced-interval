function _syncedIntervalSubscriber(dispatch, props) {
  props = {
    server: "https://shish.io/time.json",
    every: 1000,
    sync: 60000,
    samples: 5,
    onInterval: null,
    onSync: null,
    ...props,
  };
  var sync_id = null;
  var interval_id = null;
  let offsets = [];

  function offset() {
    return offsets.length
      ? offsets.reduce((a, b) => a + b, 0) / offsets.length
      : 0;
  }
  function range() {
    return Math.max(...offsets.map((o) => Math.abs(o - offset())));
  }
  function sync() {
    var sent = Date.now();
    var recvd = null;
    fetch(props.server)
      .then((response) => {
        recvd = Date.now();
        return response.json();
      })
      .then((response) => {
        var pingpong = recvd - sent;
        // if there's more than 200ms of network lag, don't
        // trust the timestamp to be accurate
        if (pingpong < 200) {
          // convert server response from seconds to ms, because
          // js does everything in ms
          offsets.push(response * 1000 - pingpong / 2 - sent);
        }
        // if we don't have much data, get more quickly
        if (offsets.length < props.samples) {
          setTimeout(sync, 1000);
        } else {
          if (offsets.length > props.samples) {
            offsets.shift();
          }
          // convert from ms to s for humans
          // console.log("Clock offset set to", offset()/1000, "+/-", range()/1000);
          if (props.onSync) {
            dispatch(props.onSync, { offset: offset(), range: range() });
          }
        }
      });
  }
  function waitForNextInterval() {
    var now = Date.now() + offset();
    if (props.onInterval) {
      dispatch(props.onInterval, now);
    }
    interval_id = setTimeout(
      waitForNextInterval,
      props.interval - (now % props.interval)
    );
  }

  if (props.interval > 0) {
    interval_id = setTimeout(
      waitForNextInterval,
      props.interval - (Date.now() % props.interval)
    );
  }
  if (props.sync > 0) {
    sync_id = setInterval(sync, props.sync);
  }
  if (props.sync >= 0) {
    sync();
  }

  return function () {
    interval_id && clearTimeout(interval_id);
    sync_id && clearInterval(sync_id);
  };
}

export function SyncedInterval(props) {
  return [_syncedIntervalSubscriber, props];
}
