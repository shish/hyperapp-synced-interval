HyperApp Synced Interval
========================

"I want this function to be called once per second, exactly at the start of
the second, with multiple hosts agreeing on when the second is"

Example in demo.html - you can open this on mutliple computers, even with
skewed clocks - each instance will sync its own time with the server, and
then change the page colour based on what it thinks the current time is. If
everything is working, all the devices should change to the same colour at
the same moment.

Usage:

```
SyncedInterval({
    server: "https://shish.io/time.json",  // should return current time in seconds
    interval: 1000, // call onInterval once per second, on the second
    sync: 60*1000,  // try to sync clocks every minute, call onSync when we are synced
    samples: 5,     // take an average of the past 5 samples
    onInterval(state, now) {
        console.log("According to the server, the time is", now);
        return state;
    },
    onSync(state, offset) {
        console.log("We are", offset, "milliseconds away from server time");
        return state;
    },
});
```

Notes for implementing the server side: the server returns time in seconds, as
a floating point, because that's what nearly all languages use. Javascript does
everything in milliseconds.