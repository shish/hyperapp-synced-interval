import { SyncedInterval } from "../src";
import fetch from "jest-mock-fetch";

function dispatch(fn, props) {
  return fn({}, props);
}

// TODO:
// Test that if we are on xxx1000
// we try to sleep for 1000
// because of clock drift we are now on xx0999
// we don't call onInterval(), sleep for 1ms, then onInterval again

describe("SyncedInterval", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(global, "setTimeout");
    jest.spyOn(global, "setInterval");
    jest.spyOn(global, "clearTimeout");
    jest.spyOn(global, "clearInterval");
    fetch.reset();
  });

  describe("sync", () => {
    it("one sample", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 0,
        samples: 1,
        onSync: fn,
      });

      jest.setSystemTime(123456042);
      sub(dispatch, props); // send a request
      fetch.mockResponse({ json: () => ({ time_s: 123456.0 }) }); // send the response
      expect(fn).toHaveBeenCalledTimes(1); // check that we process the response
      expect(fn).toHaveBeenLastCalledWith({}, { offset: -42, range: 0 });
    });
    it("retry if a sample is invalid", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 0,
        samples: 1,
        onSync: fn,
      });

      jest.setSystemTime(10000);
      sub(dispatch, props); // send a request
      jest.setSystemTime(15000); // 5 seconds pass
      fetch.mockResponse({ json: () => ({ time_s: 10.0 }) }); // our response, arrives, late
      jest.runOnlyPendingTimers(); // retry again in a second
      fetch.mockResponse({ json: () => ({ time_s: 16.0 }) });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith({}, { offset: 0, range: 0 });
    });
    it("account for network delay", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 0,
        samples: 1,
        onSync: fn,
      });

      jest.setSystemTime(10000);
      sub(dispatch, props); // we send a request at 10,000
      jest.setSystemTime(10100); // 100ms after sending request
      fetch.mockResponse({ json: () => ({ time_s: 10.05 }) }); // our response arrives
      // if we sent a request at 10,000 and got a response at 10,100,
      // we assume there is 50ms of lag in each direction. If the server
      // responds to our 10,000 message at 10,050, then that means our
      // clocks are in sync.
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith({}, { offset: 0, range: 0 });
    });
    it("multiple samples", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 0,
        samples: 3,
        onSync: fn,
      });

      // send our first request
      jest.setSystemTime(10000);
      sub(dispatch, props);

      // sending one response, it's not enough data so it creates a new timer,
      // repeat until we have enough data
      fetch.mockResponse({ json: () => ({ time_s: 10.05 }) });
      jest.runOnlyPendingTimers();
      fetch.mockResponse({ json: () => ({ time_s: 11.1 }) });
      jest.runOnlyPendingTimers();
      fetch.mockResponse({ json: () => ({ time_s: 12.15 }) });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith({}, { offset: 100, range: 50 });
    });
    it("multiple syncs", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 10000,
        samples: 3,
        onSync: fn,
      });

      // send our first request
      jest.setSystemTime(10000);
      sub(dispatch, props);

      // sending one response, it's not enough data so it creates a new timer,
      // repeat until we have enough data
      fetch.mockResponse({ json: () => ({ time_s: 10.05 }) });
      jest.advanceTimersByTime(1000);
      fetch.mockResponse({ json: () => ({ time_s: 11.1 }) });
      jest.advanceTimersByTime(1000);
      fetch.mockResponse({ json: () => ({ time_s: 12.15 }) });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith({}, { offset: 100, range: 50 });

      // Now that we've set up, our one remaining timer should be
      // the regular sync setInterval() which activates 10s after
      // the original setSystemTime()
      jest.runOnlyPendingTimers();
      fetch.mockResponse({ json: () => ({ time_s: 20.15 }) });
      expect(fn).toHaveBeenCalledTimes(2);

      // if we run the interval a couple more times, then the average
      // offset should reflect only our most recent ${samples} samples
      jest.runOnlyPendingTimers();
      fetch.mockResponse({ json: () => ({ time_s: 30.15 }) });
      jest.runOnlyPendingTimers();
      fetch.mockResponse({ json: () => ({ time_s: 40.15 }) });
      expect(fn).toHaveBeenCalledTimes(4);
      expect(fn).toHaveBeenLastCalledWith({}, { offset: 150, range: 0 });
    });
  });

  describe("interval", () => {
    it("interval loop works", () => {
      var fn = jest.fn();
      var [sub, props] = SyncedInterval({
        interval: 1000,
        sync: -1,
        onInterval: fn,
      });

      // call setup at 750
      jest.setSystemTime(750);
      sub(dispatch, props);

      // we want to be calling onInterval every 1000,
      // on the 1000, so initially sleep for 250
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 250);

      // after that first timeout happens, we should be
      // on the 1000, and sleeping for another 1000
      jest.runOnlyPendingTimers();
      expect(fn).toHaveBeenLastCalledWith({}, 1000);
      expect(setTimeout).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);

      // time drifts, we were on 1000, but now we're at 3250,
      // sleep another 750 to get back on the 1000 (we need to run
      // one timer before it notices the discrepancy, and then the
      // _next_ offset will have been corrected)
      jest.setSystemTime(3250);
      jest.runOnlyPendingTimers();
      expect(fn).toHaveBeenLastCalledWith({}, 4250);
      expect(setTimeout).toHaveBeenCalledTimes(3);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 750);
      jest.runOnlyPendingTimers();
      expect(fn).toHaveBeenLastCalledWith({}, 5000);
    });
  });
  describe("unsubscribe", () => {
    it("with no timers", () => {
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 0,
        samples: 1,
      });
      var unsub = sub(dispatch, props);
      unsub();
      expect(clearTimeout).not.toBeCalled();
      expect(clearInterval).not.toBeCalled();
    });
    it("with sync timer", () => {
      var [sub, props] = SyncedInterval({
        interval: 0,
        sync: 60 * 1000,
        samples: 1,
      });
      var unsub = sub(dispatch, props);
      unsub();
      expect(clearTimeout).not.toBeCalled();
      expect(clearInterval).toBeCalled();
    });
    it("with interval timer", () => {
      var [sub, props] = SyncedInterval({
        interval: 1000,
        sync: 0,
        samples: 1,
      });
      var unsub = sub(dispatch, props);
      unsub();
      expect(clearTimeout).toBeCalled();
      expect(clearInterval).not.toBeCalled();
    });
  });
});
