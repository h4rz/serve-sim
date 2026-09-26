# Physical iOS device backend

This package contains the WebDriverAgent session and local MJPEG relay used by Reactotron's physical-iPhone preview. It is separate from the simulator CLI and does not change simulator capture or controls.

It requires macOS, Xcode, a trusted USB-connected iPhone, a signing identity, `pymobiledevice3`, and a WebDriverAgent checkout. The host application owns device discovery, local port selection, lifecycle, and UI. All relay endpoints require a session token; keep the relay bound to loopback.

The package is currently consumed from a pinned commit of this fork. It has not been published to npm.

The initial device-mode implementation was adapted from [serve-sim PR #83](https://github.com/EvanBacon/serve-sim/pull/83) by longtimeno-c.
