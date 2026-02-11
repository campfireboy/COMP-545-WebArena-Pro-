import java.util.*;

public class SubwaySystem {

    private HashMap<String, List<Connection>> graph;

    public SubwaySystem() {
        graph = new HashMap<>();
    }

    /* ========================
       Part 1: Graph Construction
       ======================== */

    public void addStation(String station) {
        graph.putIfAbsent(station, new ArrayList<>());
    }

    public void addConnection(String from, String to, int time, String line) {

        addStation(from);
        addStation(to);

        graph.get(from).add(new Connection(to, time, line));
        graph.get(to).add(new Connection(from, time, line));
    }

    /* ========================
       Part 2: Connectivity Check
       ======================== */

    public boolean canTravel(String start, String destination) {

        if (!graph.containsKey(start) || !graph.containsKey(destination))
            return false;

        Set<String> visited = new HashSet<>();
        Queue<String> queue = new LinkedList<>();

        queue.add(start);
        visited.add(start);

        while (!queue.isEmpty()) {

            String current = queue.poll();

            if (current.equals(destination))
                return true;

            for (Connection conn : graph.get(current)) {

                if (!visited.contains(conn.destination)) {
                    visited.add(conn.destination);
                    queue.add(conn.destination);
                }
            }
        }

        return false;
    }

    /* ========================
       Part 3: Shortest Path (Fewest Stops)
       ======================== */

    public List<String> fewestStops(String start, String destination) {

        HashMap<String, String> parent = new HashMap<>();
        Queue<String> queue = new LinkedList<>();
        Set<String> visited = new HashSet<>();

        queue.add(start);
        visited.add(start);

        while (!queue.isEmpty()) {

            String current = queue.poll();

            if (current.equals(destination))
                break;

            for (Connection conn : graph.get(current)) {

                if (!visited.contains(conn.destination)) {
                    visited.add(conn.destination);
                    parent.put(conn.destination, current);
                    queue.add(conn.destination);
                }
            }
        }

        return reconstructPath(parent, start, destination);
    }

    /* ========================
       Part 4: Fastest Route (Dijkstra)
       ======================== */

    public List<String> fastestRoute(String start, String destination) {

        HashMap<String, Integer> dist = new HashMap<>();
        HashMap<String, String> parent = new HashMap<>();

        PriorityQueue<String> pq =
                new PriorityQueue<>(Comparator.comparingInt(dist::get));

        for (String station : graph.keySet()) {
            dist.put(station, Integer.MAX_VALUE);
        }

        dist.put(start, 0);
        pq.add(start);

        while (!pq.isEmpty()) {

            String current = pq.poll();

            for (Connection conn : graph.get(current)) {

                int newDist = dist.get(current) + conn.travelTime;

                if (newDist < dist.get(conn.destination)) {
                    dist.put(conn.destination, newDist);
                    parent.put(conn.destination, current);
                    pq.add(conn.destination);
                }
            }
        }

        System.out.println("Fastest time: " + dist.get(destination));
        return reconstructPath(parent, start, destination);
    }

    /* ========================
       Part 5: Transfer Counter
       ======================== */

    public int countTransfers(List<String> path) {

        if (path.size() < 2) return 0;

        int transfers = 0;
        String currentLine = null;

        for (int i = 0; i < path.size() - 1; i++) {

            String from = path.get(i);
            String to = path.get(i + 1);

            for (Connection conn : graph.get(from)) {
                if (conn.destination.equals(to)) {

                    if (currentLine == null) {
                        currentLine = conn.line;
                    } else if (!currentLine.equals(conn.line)) {
                        transfers++;
                        currentLine = conn.line;
                    }
                }
            }
        }

        return transfers;
    }

    /* ========================
       Part 6: System Statistics
       ======================== */

    public int totalStations() {
        return graph.size();
    }

    public int totalConnections() {

        int total = 0;
        for (String station : graph.keySet()) {
            total += graph.get(station).size();
        }

        return total / 2; // Undirected graph
    }

    public String mostConnectedStation() {

        String best = null;
        int max = 0;

        for (String station : graph.keySet()) {

            int degree = graph.get(station).size();

            if (degree > max) {
                max = degree;
                best = station;
            }
        }

        return best;
    }

    /* ========================
       Helper: Path Reconstruction
       ======================== */

    private List<String> reconstructPath(
            HashMap<String, String> parent,
            String start,
            String destination) {

        List<String> path = new ArrayList<>();
        String current = destination;

        while (current != null) {
            path.add(current);
            current = parent.get(current);
        }

        Collections.reverse(path);

        if (!path.get(0).equals(start))
            return new ArrayList<>();

        return path;
    }
}
