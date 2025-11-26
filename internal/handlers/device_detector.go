package handlers

import (
	"strings"
)

type DeviceInfo struct {
	DeviceName string
	Browser    string
	OS         string
}

// ParseUserAgent extracts device info from User-Agent header
func ParseUserAgent(userAgent string) DeviceInfo {
	// Simple parser (install ua-parser-go for production)
	// go get github.com/ua-parser/uap-go/v2
	
	// Fallback implementation (basic)
	device := DeviceInfo{
		DeviceName: "Unknown Device",
		Browser:    "Unknown Browser",
		OS:         "Unknown OS",
	}

	ua := strings.ToLower(userAgent)

	// Detect OS
	if strings.Contains(ua, "windows") {
		device.OS = "Windows"
	} else if strings.Contains(ua, "mac") {
		device.OS = "macOS"
	} else if strings.Contains(ua, "linux") {
		device.OS = "Linux"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		device.OS = "iOS"
	} else if strings.Contains(ua, "android") {
		device.OS = "Android"
	}

	// Detect Browser
	if strings.Contains(ua, "chrome") {
		device.Browser = "Chrome"
	} else if strings.Contains(ua, "firefox") {
		device.Browser = "Firefox"
	} else if strings.Contains(ua, "safari") {
		device.Browser = "Safari"
	} else if strings.Contains(ua, "edge") {
		device.Browser = "Edge"
	}

	// Set device name
	device.DeviceName = device.Browser + " on " + device.OS

	return device
}