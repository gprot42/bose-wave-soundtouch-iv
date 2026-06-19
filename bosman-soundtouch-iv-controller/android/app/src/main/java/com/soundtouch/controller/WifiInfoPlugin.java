package com.soundtouch.controller;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.MacAddress;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.RouteInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "WifiInfo")
public class WifiInfoPlugin extends Plugin {

    private static final String TAG = "WifiInfoPlugin";

    private ConnectivityManager.NetworkCallback localWifiCallback;
    private ConnectivityManager.NetworkCallback boseWifiCallback;
    private Network retainedNetwork;

    @PluginMethod
    public void getNetworkInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ip", "");
        ret.put("gateway", "");
        ret.put("prefix", "");
        ret.put("wifi", false);
        ret.put("validated", false);
        ret.put("ssid", "");
        ret.put("boseSetupAp", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network network = findWifiNetwork(cm);
                if (network != null) {
                    fillNetworkInfo(cm, network, ret);
                }
            }
            fillSsidInfo(ret);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void httpGet(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        int timeoutMs = call.getInt("timeoutMs", 3500);
        JSObject ret = new JSObject();
        ret.put("status", 0);
        ret.put("body", "");
        ret.put("ok", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, url);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            try {
                HttpURLConnection conn = openHttpConnection(cm, network, new URL(url));
                conn.setConnectTimeout(timeoutMs);
                conn.setReadTimeout(timeoutMs);
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(true);
                readHttpResponse(conn, ret);
            } catch (Exception networkError) {
                if (!isPermissionError(networkError)) throw networkError;
                Log.w(TAG, "bound GET failed; retrying unbound: " + networkError.getMessage());
                try {
                    cm.bindProcessToNetwork(null);
                } catch (Exception ignored) {}
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(timeoutMs);
                conn.setReadTimeout(timeoutMs);
                conn.setRequestMethod("GET");
                conn.setInstanceFollowRedirects(true);
                readHttpResponse(conn, ret);
            }
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void httpPost(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }

        String body = call.getString("body", "");
        String contentType = call.getString("contentType", "application/x-www-form-urlencoded");
        String soapAction = call.getString("soapAction", "");
        int timeoutMs = call.getInt("timeoutMs", 6000);

        JSObject ret = new JSObject();
        ret.put("status", 0);
        ret.put("body", "");
        ret.put("ok", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, url);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            byte[] payload = (body == null ? "" : body).getBytes(StandardCharsets.UTF_8);
            try {
                HttpURLConnection conn = openHttpConnection(cm, network, new URL(url));
                writeHttpPost(conn, timeoutMs, contentType, soapAction, payload);
                readHttpResponse(conn, ret);
            } catch (Exception networkError) {
                if (!isPermissionError(networkError)) throw networkError;
                Log.w(TAG, "bound POST failed; retrying unbound: " + networkError.getMessage());
                try {
                    cm.bindProcessToNetwork(null);
                } catch (Exception ignored) {}
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                writeHttpPost(conn, timeoutMs, contentType, soapAction, payload);
                readHttpResponse(conn, ret);
            }
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void tcpCommand(PluginCall call) {
        String host = call.getString("host");
        String command = call.getString("command");
        if (host == null || host.isEmpty()) {
            call.reject("host is required");
            return;
        }
        if (command == null) {
            call.reject("command is required");
            return;
        }

        int port = call.getInt("port", 17000);
        int timeoutMs = call.getInt("timeoutMs", 5000);
        int connectTimeoutMs = call.getInt("connectTimeoutMs", 3500);

        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("connected", false);
        ret.put("body", "");

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, host);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            fillNetworkInfo(cm, network, ret);
            fillSsidInfo(ret);
            bindProcessToWifi(cm, network);

            String response = exchangeTcpCommand(network, host, port, command, connectTimeoutMs, timeoutMs);
            ret.put("connected", true);
            ret.put("body", response);
            ret.put("ok", true);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void tcpProbe(PluginCall call) {
        String host = call.getString("host");
        if (host == null || host.isEmpty()) {
            call.reject("host is required");
            return;
        }

        int port = call.getInt("port", 17000);
        int connectTimeoutMs = call.getInt("connectTimeoutMs", 5000);

        JSObject ret = new JSObject();
        ret.put("ok", false);
        ret.put("connected", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, host);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            fillNetworkInfo(cm, network, ret);
            fillSsidInfo(ret);
            bindProcessToWifi(cm, network);

            Socket socket = openBoundSocket(cm, network, host, port, connectTimeoutMs);
            try {
                ret.put("connected", true);
                ret.put("ok", true);
                Log.i(TAG, "tcpProbe connected to " + host + ":" + port);
            } finally {
                socket.close();
            }
        } catch (Exception e) {
            ret.put("error", e.getMessage());
            Log.w(TAG, "tcpProbe failed " + host + ":" + port + " -> " + e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void tcpPortScan(PluginCall call) {
        String host = call.getString("host");
        if (host == null || host.isEmpty()) {
            call.reject("host is required");
            return;
        }

        String portsCsv = call.getString("ports", "17000,8090,80,8080,443,23,12500");
        int connectTimeoutMs = call.getInt("connectTimeoutMs", 2500);

        JSObject ret = new JSObject();
        JSArray openPorts = new JSArray();

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, host);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            fillNetworkInfo(cm, network, ret);
            fillSsidInfo(ret);
            bindProcessToWifi(cm, network);

            for (String part : portsCsv.split(",")) {
                String trimmed = part.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                int port = Integer.parseInt(trimmed);
                try {
                    Socket socket = openBoundSocket(cm, network, host, port, connectTimeoutMs);
                    socket.close();
                    openPorts.put(port);
                    Log.i(TAG, "tcpPortScan open " + host + ":" + port);
                } catch (Exception portError) {
                    Log.d(TAG, "tcpPortScan closed " + host + ":" + port + " -> " + portError.getMessage());
                }
            }

            ret.put("openPorts", openPorts);
            ret.put("ok", openPorts.length() > 0);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    private void bindProcessToWifi(ConnectivityManager cm, Network network) {
        retainedNetwork = network;
        try {
            cm.bindProcessToNetwork(network);
        } catch (Exception e) {
            Log.w(TAG, "bindProcessToNetwork skipped: " + e.getMessage());
        }
    }

    @PluginMethod
    public void scanSubnet(PluginCall call) {
        String prefix = call.getString("prefix", "");
        if (prefix == null || prefix.isEmpty()) {
            call.reject("prefix is required");
            return;
        }
        final int port = call.getInt("port", 8090);
        final int connectTimeoutMs = call.getInt("connectTimeoutMs", 400);
        final int startHost = call.getInt("startHost", 1);
        final int endHost = call.getInt("endHost", 254);
        final int concurrency = Math.max(1, Math.min(call.getInt("concurrency", 64), 128));

        JSObject ret = new JSObject();
        JSArray openHosts = new JSArray();

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            // Resolve and bind the right Wi-Fi network ONCE for the whole sweep
            final Network network = findBestWifiNetwork(cm, prefix + "." + startHost);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }
            bindProcessToWifi(cm, network);
            final String localIp = getLocalIpv4(cm, network);

            ExecutorService pool = Executors.newFixedThreadPool(concurrency);
            List<Future<String>> futures = new ArrayList<>();
            for (int host = startHost; host <= endHost; host++) {
                final String ip = prefix + "." + host;
                futures.add(pool.submit(() ->
                    probeOpen(network, localIp, ip, port, connectTimeoutMs) ? ip : null
                ));
            }
            pool.shutdown();
            for (Future<String> f : futures) {
                try {
                    String ip = f.get();
                    if (ip != null) openHosts.put(ip);
                } catch (Exception ignored) {}
            }
            pool.awaitTermination(Math.max(1000, connectTimeoutMs * 2L), TimeUnit.MILLISECONDS);

            ret.put("openHosts", openHosts);
            ret.put("ok", true);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    @PluginMethod
    public void ssdpSearch(PluginCall call) {
        final int timeoutMs = call.getInt("timeoutMs", 3000);

        JSObject ret = new JSObject();
        JSArray devices = new JSArray();

        MulticastSocket socket = null;
        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("error", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            Network network = findBestWifiNetwork(cm, null);
            if (network == null) {
                ret.put("error", "No Wi-Fi network");
                call.resolve(ret);
                return;
            }

            // Bind to the local Wi-Fi IPv4 so the M-SEARCH multicast egresses the
            // Wi-Fi interface. network.bindSocket() throws EPERM on GrapheneOS, so we
            // mirror probeOpen()'s working pattern of binding to the local address.
            String localIp = getLocalIpv4(cm, network);
            if (localIp != null) {
                InetAddress localAddr = Inet4Address.getByName(localIp);
                socket = new MulticastSocket(new InetSocketAddress(localAddr, 0));
                try {
                    socket.setInterface(localAddr);
                } catch (Exception ifaceError) {
                    Log.w(TAG, "ssdp setInterface skipped: " + ifaceError.getMessage());
                }
            } else {
                socket = new MulticastSocket();
            }
            socket.setSoTimeout(500);

            InetAddress group = InetAddress.getByName("239.255.255.250");
            String[] searchTargets = new String[] {
                "ssdp:all",
                "urn:schemas-upnp-org:device:MediaServer:1",
                "urn:schemas-upnp-org:device:MediaRenderer:1"
            };
            for (String st : searchTargets) {
                String request = "M-SEARCH * HTTP/1.1\r\n" +
                    "HOST: 239.255.255.250:1900\r\n" +
                    "MAN: \"ssdp:discover\"\r\n" +
                    "MX: 2\r\n" +
                    "ST: " + st + "\r\n\r\n";
                byte[] msg = request.getBytes(StandardCharsets.UTF_8);
                try {
                    socket.send(new DatagramPacket(msg, msg.length, group, 1900));
                } catch (Exception sendError) {
                    Log.w(TAG, "ssdp send failed for " + st + ": " + sendError.getMessage());
                }
            }

            Set<String> seenLocations = new HashSet<>();
            byte[] buffer = new byte[4096];
            long deadline = System.currentTimeMillis() + timeoutMs;
            while (System.currentTimeMillis() < deadline) {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                } catch (SocketTimeoutException te) {
                    continue;
                } catch (Exception receiveError) {
                    break;
                }

                String response = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                String location = headerValue(response, "LOCATION");
                if (location == null || location.isEmpty()) continue;
                if (!seenLocations.add(location)) continue;

                JSObject dev = new JSObject();
                dev.put("location", location);
                String st = headerValue(response, "ST");
                String usn = headerValue(response, "USN");
                String server = headerValue(response, "SERVER");
                dev.put("st", st == null ? "" : st);
                dev.put("usn", usn == null ? "" : usn);
                dev.put("server", server == null ? "" : server);
                dev.put("address", packet.getAddress() != null ? packet.getAddress().getHostAddress() : "");
                devices.put(dev);
                Log.i(TAG, "ssdp found " + location);
            }

            ret.put("devices", devices);
            ret.put("ok", true);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (Exception ignored) {}
            }
        }

        call.resolve(ret);
    }

    private String headerValue(String response, String name) {
        if (response == null) return null;
        for (String line : response.split("\r\n")) {
            int idx = line.indexOf(':');
            if (idx <= 0) continue;
            String key = line.substring(0, idx).trim();
            if (key.equalsIgnoreCase(name)) {
                return line.substring(idx + 1).trim();
            }
        }
        return null;
    }

    private boolean probeOpen(Network network, String localIp, String host, int port, int connectTimeoutMs) {
        Socket socket = new Socket();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    network.bindSocket(socket);
                } catch (Exception ignored) {}
            }
            if (localIp != null) {
                try {
                    socket.bind(new InetSocketAddress(Inet4Address.getByName(localIp), 0));
                } catch (Exception ignored) {}
            }
            socket.connect(new InetSocketAddress(Inet4Address.getByName(host), port), connectTimeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                socket.close();
            } catch (Exception ignored) {}
        }
    }

    private HttpURLConnection openHttpConnection(ConnectivityManager cm, Network network, URL url) throws Exception {
        try {
            return (HttpURLConnection) network.openConnection(url);
        } catch (Exception networkError) {
            if (!isPermissionError(networkError)) {
                throw networkError;
            }
            Log.w(TAG, "network.openConnection failed; retrying unbound: " + networkError.getMessage());
            try {
                cm.bindProcessToNetwork(null);
            } catch (Exception ignored) {}
            return (HttpURLConnection) url.openConnection();
        }
    }

    private void writeHttpPost(
        HttpURLConnection conn,
        int timeoutMs,
        String contentType,
        String soapAction,
        byte[] payload
    ) throws Exception {
        conn.setConnectTimeout(timeoutMs);
        conn.setReadTimeout(timeoutMs);
        conn.setRequestMethod("POST");
        conn.setInstanceFollowRedirects(true);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", contentType);
        if (soapAction != null && !soapAction.isEmpty()) {
            conn.setRequestProperty("SOAPAction", soapAction);
        }
        conn.setFixedLengthStreamingMode(payload.length);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(payload);
            os.flush();
        }
    }

    private void readHttpResponse(HttpURLConnection conn, JSObject ret) throws Exception {
        try {
            int status = conn.getResponseCode();
            ret.put("status", status);
            ret.put("ok", status >= 200 && status < 300);

            InputStream stream = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream != null) {
                ret.put("body", readStream(stream));
            }
        } finally {
            conn.disconnect();
        }
    }

    private String readStream(InputStream stream) throws Exception {
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (body.length() > 0) body.append('\n');
                body.append(line);
            }
        }
        return body.toString();
    }

    private boolean isPermissionError(Exception e) {
        String message = e.getMessage();
        return message != null && (
            message.contains("EPERM") ||
            message.contains("Operation not permitted") ||
            message.contains("Permission denied")
        );
    }

    private Socket openBoundSocket(ConnectivityManager cm, Network network, String host, int port, int connectTimeoutMs)
        throws Exception {
        InetAddress remote = Inet4Address.getByName(host);
        String localIp = getLocalIpv4(cm, network);
        Socket socket = new Socket();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                network.bindSocket(socket);
            } catch (Exception bindError) {
                Log.w(TAG, "bindSocket skipped: " + bindError.getMessage());
            }
        }

        if (localIp != null) {
            try {
                socket.bind(new InetSocketAddress(Inet4Address.getByName(localIp), 0));
                Log.i(TAG, "bound local " + localIp + " for " + host + ":" + port);
            } catch (Exception localBindError) {
                Log.w(TAG, "local bind skipped: " + localBindError.getMessage());
            }
        }

        socket.connect(new InetSocketAddress(remote, port), connectTimeoutMs);
        Log.i(TAG, "connected to " + host + ":" + port + " from " + socket.getLocalAddress());
        socket.setTcpNoDelay(true);
        return socket;
    }

    private String getLocalIpv4(ConnectivityManager cm, Network network) {
        LinkProperties props = cm.getLinkProperties(network);
        if (props != null) {
            for (LinkAddress link : props.getLinkAddresses()) {
                InetAddress addr = link.getAddress();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                    return addr.getHostAddress();
                }
            }
        }

        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null && wm.getDhcpInfo() != null) {
            int ip = wm.getDhcpInfo().ipAddress;
            if (ip != 0) {
                return intToIp(ip);
            }
        }

        return null;
    }

    private String exchangeTcpCommand(
        Network network,
        String host,
        int port,
        String command,
        int connectTimeoutMs,
        int readTimeoutMs
    ) throws Exception {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        Socket socket = openBoundSocket(cm, network, host, port, connectTimeoutMs);
        try {
            socket.setSoTimeout(300);

            StringBuilder transcript = new StringBuilder();
            readAvailableBytes(socket, transcript, 2000);

            String payload = formatCliPayload(command);
            OutputStream out = socket.getOutputStream();
            out.write(payload.getBytes(StandardCharsets.UTF_8));
            out.flush();

            readAvailableBytes(socket, transcript, readTimeoutMs);
            String response = transcript.toString().trim();
            if (response.startsWith("->")) {
                int firstNewline = response.indexOf('\n');
                if (firstNewline >= 0) {
                    response = response.substring(firstNewline + 1).trim();
                }
            }
            return response;
        } finally {
            try {
                socket.close();
            } catch (Exception ignored) {}
        }
    }

    private String formatCliPayload(String command) {
        if (command == null || command.isEmpty()) {
            return "\r\n";
        }
        String normalized = command.replace("\r\n", "\n").replace('\r', '\n');
        if (normalized.endsWith("\n")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized + "\r\n";
    }

    private void readAvailableBytes(Socket socket, StringBuilder target, int maxWaitMs) throws Exception {
        long deadline = System.currentTimeMillis() + maxWaitMs;
        InputStream in = socket.getInputStream();
        byte[] buffer = new byte[4096];
        int idleRounds = 0;

        while (System.currentTimeMillis() < deadline && idleRounds < 12) {
            try {
                int read = in.read(buffer);
                if (read > 0) {
                    target.append(new String(buffer, 0, read, StandardCharsets.UTF_8));
                    idleRounds = 0;
                    continue;
                }
                if (read < 0) {
                    break;
                }
            } catch (Exception e) {
                idleRounds++;
            }
        }
    }

    @PluginMethod
    public void retainLocalWifi(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("bound", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) {
                ret.put("reason", "ConnectivityManager unavailable");
                call.resolve(ret);
                return;
            }

            String boseSsid = findBoseSsid();
            if (boseSsid != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                requestBoseWifiNetwork(cm, boseSsid, ret, call);
                return;
            }

            Network wifiNetwork = findBestWifiNetwork(cm);
            if (wifiNetwork == null) {
                ret.put("reason", "No Wi-Fi network found");
                call.resolve(ret);
                return;
            }

            bindAndRetain(cm, wifiNetwork, ret);
            call.resolve(ret);
        } catch (Exception e) {
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void releaseNetworkBinding(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("bound", false);

        try {
            ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            retainedNetwork = null;
            if (localWifiCallback != null && cm != null) {
                try {
                    cm.unregisterNetworkCallback(localWifiCallback);
                } catch (Exception ignored) {}
                localWifiCallback = null;
            }
            if (boseWifiCallback != null && cm != null) {
                try {
                    cm.unregisterNetworkCallback(boseWifiCallback);
                } catch (Exception ignored) {}
                boseWifiCallback = null;
            }
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                cm.bindProcessToNetwork(null);
            }
        } catch (Exception e) {
            ret.put("error", e.getMessage());
        }

        call.resolve(ret);
    }

    private void requestBoseWifiNetwork(
        ConnectivityManager cm,
        String ssid,
        JSObject ret,
        PluginCall call
    ) {
        ret.put("ssid", ssid);

        if (boseWifiCallback != null) {
            try {
                cm.unregisterNetworkCallback(boseWifiCallback);
            } catch (Exception ignored) {}
            boseWifiCallback = null;
        }

        WifiNetworkSpecifier.Builder specifierBuilder = new WifiNetworkSpecifier.Builder().setSsid(ssid);
        String bssid = findConnectedBssid();
        if (bssid != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                specifierBuilder.setBssid(MacAddress.fromString(bssid));
            } catch (IllegalArgumentException ignored) {}
        }

        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .setNetworkSpecifier(specifierBuilder.build())
            .build();

        boseWifiCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                bindAndRetain(cm, network, ret);
                ret.put("requested", true);
                call.resolve(ret);
            }

            @Override
            public void onLost(Network network) {
                cm.bindProcessToNetwork(null);
            }

            @Override
            public void onUnavailable() {
                Network wifiNetwork = findBestWifiNetwork(cm);
                if (wifiNetwork != null) {
                    bindAndRetain(cm, wifiNetwork, ret);
                    ret.put("reason", "Specifier unavailable; using active Wi-Fi");
                    call.resolve(ret);
                    return;
                }
                ret.put("reason", "Bose Wi-Fi unavailable");
                call.resolve(ret);
            }
        };

        cm.requestNetwork(request, boseWifiCallback);
    }

    private void bindAndRetain(ConnectivityManager cm, Network wifiNetwork, JSObject ret) {
        retainedNetwork = wifiNetwork;
        boolean bound = cm.bindProcessToNetwork(wifiNetwork);
        ret.put("bound", bound);
        fillNetworkInfo(cm, wifiNetwork, ret);

        if (localWifiCallback != null) {
            try {
                cm.unregisterNetworkCallback(localWifiCallback);
            } catch (Exception ignored) {}
            localWifiCallback = null;
        }

        NetworkRequest request = new NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build();

        localWifiCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                cm.bindProcessToNetwork(network);
            }

            @Override
            public void onLost(Network network) {
                cm.bindProcessToNetwork(null);
            }
        };

        cm.requestNetwork(request, localWifiCallback);
        ret.put("requested", true);
    }

    private String findBoseSsid() {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) {
            return null;
        }

        WifiInfo info = wm.getConnectionInfo();
        if (info == null) {
            return null;
        }

        String ssid = info.getSSID();
        if (ssid == null || ssid.equals("<unknown ssid>") || ssid.equals("0x")) {
            return null;
        }

        ssid = ssid.replace("\"", "");
        String lower = ssid.toLowerCase();
        if (lower.contains("bose") || lower.contains("soundtouch") || lower.contains("bose_setup")) {
            return ssid;
        }

        return null;
    }

    private String findConnectedBssid() {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) {
            return null;
        }

        WifiInfo info = wm.getConnectionInfo();
        if (info == null) {
            return null;
        }

        String bssid = info.getBSSID();
        if (bssid == null || bssid.equals("02:00:00:00:00:00")) {
            return null;
        }

        return bssid;
    }

    private Network findBestWifiNetwork(ConnectivityManager cm) {
        return findBestWifiNetwork(cm, null);
    }

    private Network findBestWifiNetwork(ConnectivityManager cm, String target) {
        String targetPrefix = subnetPrefixFromTarget(target);
        if (retainedNetwork != null && hasWifiTransport(cm, retainedNetwork)) {
            if (targetPrefix == null || networkHasPrefix(cm, retainedNetwork, targetPrefix)) {
                return retainedNetwork;
            }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network bound = cm.getBoundNetworkForProcess();
            if (bound != null && hasWifiTransport(cm, bound)) {
                if (targetPrefix == null || networkHasPrefix(cm, bound, targetPrefix)) {
                    return bound;
                }
            }
        }

        Network best = null;
        int bestScore = Integer.MIN_VALUE;
        for (Network network : cm.getAllNetworks()) {
            if (!hasWifiTransport(cm, network)) {
                continue;
            }
            int score = scoreWifiNetwork(cm, network, targetPrefix);
            if (score > bestScore) {
                bestScore = score;
                best = network;
            }
        }

        return best;
    }

    private boolean hasWifiTransport(ConnectivityManager cm, Network network) {
        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    }

    private int scoreWifiNetwork(ConnectivityManager cm, Network network, String targetPrefix) {
        int score = 0;
        LinkProperties props = cm.getLinkProperties(network);
        if (props != null) {
            for (LinkAddress link : props.getLinkAddresses()) {
                InetAddress addr = link.getAddress();
                if (addr instanceof Inet4Address) {
                    String ip = addr.getHostAddress();
                    if (ip != null) {
                        if (targetPrefix != null && ip.startsWith(targetPrefix + ".")) {
                            score += 500;
                        }
                        if (ip.startsWith("192.0.2.")) {
                            score += 200;
                        } else if (ip.startsWith("192.168.")) {
                            score += 40;
                        } else if (ip.startsWith("10.")) {
                            score += 20;
                        }
                    }
                }
            }
        }

        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        if (caps != null) {
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                score += 80;
            }
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                score += 40;
            }
        }

        if (network.equals(cm.getActiveNetwork())) {
            score += 10;
        }

        return score;
    }

    private String subnetPrefixFromTarget(String target) {
        if (target == null || target.isEmpty()) return null;
        try {
            String host = target;
            if (target.contains("://")) {
                host = URI.create(target).getHost();
            }
            if (host == null || host.isEmpty() || host.contains(":")) return null;
            String[] parts = host.split("\\.");
            if (parts.length != 4) return null;
            return parts[0] + "." + parts[1] + "." + parts[2];
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean networkHasPrefix(ConnectivityManager cm, Network network, String prefix) {
        LinkProperties props = cm.getLinkProperties(network);
        if (props == null) return false;
        for (LinkAddress link : props.getLinkAddresses()) {
            InetAddress addr = link.getAddress();
            if (addr instanceof Inet4Address) {
                String ip = addr.getHostAddress();
                if (ip != null && ip.startsWith(prefix + ".")) return true;
            }
        }
        return false;
    }

    private Network findWifiNetwork(ConnectivityManager cm) {
        return findBestWifiNetwork(cm);
    }

    private void fillNetworkInfo(ConnectivityManager cm, Network network, JSObject ret) {
        LinkProperties props = cm.getLinkProperties(network);
        if (props != null) {
            for (LinkAddress link : props.getLinkAddresses()) {
                InetAddress addr = link.getAddress();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                    ret.put("ip", addr.getHostAddress());
                    ret.put("prefix", String.valueOf(link.getPrefixLength()));
                    break;
                }
            }
            for (RouteInfo route : props.getRoutes()) {
                if (route.isDefaultRoute()) {
                    InetAddress gateway = route.getGateway();
                    if (gateway instanceof Inet4Address) {
                        ret.put("gateway", gateway.getHostAddress());
                        break;
                    }
                }
            }
        }

        NetworkCapabilities caps = cm.getNetworkCapabilities(network);
        if (caps != null) {
            ret.put("wifi", caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
            ret.put("validated", caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        }

        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null && wm.getDhcpInfo() != null) {
            int gateway = wm.getDhcpInfo().gateway;
            if (gateway != 0) {
                ret.put("gateway", intToIp(gateway));
            }
            if (ret.getString("ip", "").isEmpty()) {
                int ip = wm.getDhcpInfo().ipAddress;
                if (ip != 0) {
                    ret.put("ip", intToIp(ip));
                }
            }
        }

        if (ret.getString("gateway", "").isEmpty()) {
            String ip = ret.getString("ip", "");
            if (ip.contains(".")) {
                int lastDot = ip.lastIndexOf('.');
                if (lastDot > 0) {
                    ret.put("gateway", ip.substring(0, lastDot) + ".1");
                }
            }
        }
    }

    private void fillSsidInfo(JSObject ret) {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) {
            return;
        }

        WifiInfo info = wm.getConnectionInfo();
        if (info == null) {
            return;
        }

        String ssid = info.getSSID();
        if (ssid == null || ssid.equals("<unknown ssid>") || ssid.equals("0x")) {
            return;
        }

        ssid = ssid.replace("\"", "");
        ret.put("ssid", ssid);

        String lower = ssid.toLowerCase();
        String ip = ret.getString("ip", "");
        boolean setupSsid = lower.contains("bose") || lower.contains("soundtouch") || lower.contains("bose_setup");
        boolean setupSubnet = ip.startsWith("192.0.2.");
        ret.put("boseSetupAp", setupSubnet || (setupSsid && (lower.contains("setup") || lower.contains("wave st"))));
    }

    @Override
    protected void handleOnDestroy() {
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            if (localWifiCallback != null) {
                try {
                    cm.unregisterNetworkCallback(localWifiCallback);
                } catch (Exception ignored) {}
                localWifiCallback = null;
            }
            if (boseWifiCallback != null) {
                try {
                    cm.unregisterNetworkCallback(boseWifiCallback);
                } catch (Exception ignored) {}
                boseWifiCallback = null;
            }
            cm.bindProcessToNetwork(null);
            retainedNetwork = null;
        }
        super.handleOnDestroy();
    }

    private String intToIp(int ip) {
        return String.format(
            "%d.%d.%d.%d",
            (ip & 0xff),
            (ip >> 8 & 0xff),
            (ip >> 16 & 0xff),
            (ip >> 24 & 0xff)
        );
    }
}