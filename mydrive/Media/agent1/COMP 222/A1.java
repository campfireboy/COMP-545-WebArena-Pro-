import java.util.*;

public class TextAnalyticsEngine {

    /* ==============================
       Part 1: Word Frequency Counter
       ============================== */
    public static HashMap<String, Integer> wordFrequency(String text) {

        HashMap<String, Integer> freqMap = new HashMap<>();

        String cleaned = text.toLowerCase().replaceAll("[^a-z0-9 ]", "");
        String[] words = cleaned.split("\\s+");

        for (String word : words) {
            if (word.isEmpty()) continue;
            freqMap.put(word, freqMap.getOrDefault(word, 0) + 1);
        }

        return freqMap;
    }

    /* ==============================
       Part 2: Word Position Index
       ============================== */
    public static HashMap<String, List<Integer>> wordPositions(String text) {

        HashMap<String, List<Integer>> positionMap = new HashMap<>();

        String cleaned = text.toLowerCase().replaceAll("[^a-z0-9 ]", "");
        String[] words = cleaned.split("\\s+");

        for (int i = 0; i < words.length; i++) {

            String word = words[i];
            if (word.isEmpty()) continue;

            positionMap.putIfAbsent(word, new ArrayList<>());
            positionMap.get(word).add(i);
        }

        return positionMap;
    }

    /* ==============================
       Part 3: Top-K Frequent Words
       ============================== */
    public static List<String> topKFrequent(HashMap<String, Integer> freqMap, int k) {

        PriorityQueue<Map.Entry<String, Integer>> minHeap =
                new PriorityQueue<>(Comparator.comparingInt(Map.Entry::getValue));

        for (Map.Entry<String, Integer> entry : freqMap.entrySet()) {

            minHeap.offer(entry);

            if (minHeap.size() > k) {
                minHeap.poll();
            }
        }

        List<String> result = new ArrayList<>();

        while (!minHeap.isEmpty()) {
            result.add(minHeap.poll().getKey());
        }

        Collections.reverse(result);
        return result;
    }

    /* ==============================
       Part 4: Duplicate Document Detection
       ============================== */
    public static boolean areDocumentsDuplicate(String doc1, String doc2) {

        HashMap<String, Integer> freq1 = wordFrequency(doc1);
        HashMap<String, Integer> freq2 = wordFrequency(doc2);

        return freq1.equals(freq2);
    }

    /* ==============================
       Part 5: Jaccard Similarity
       ============================== */
    public static double jaccardSimilarity(String doc1, String doc2) {

        Set<String> set1 = wordFrequency(doc1).keySet();
        Set<String> set2 = wordFrequency(doc2).keySet();

        Set<String> intersection = new HashSet<>(set1);
        intersection.retainAll(set2);

        Set<String> union = new HashSet<>(set1);
        union.addAll(set2);

        if (union.size() == 0) return 0.0;

        return (double) intersection.size() / union.size();
    }

    /* ==============================
       Utility Print Methods
       ============================== */
    public static void printFrequency(HashMap<String, Integer> freqMap) {
        for (String word : freqMap.keySet()) {
            System.out.println(word + " -> " + freqMap.get(word));
        }
    }

    public static void printPositions(HashMap<String, List<Integer>> posMap) {
        for (String word : posMap.keySet()) {
            System.out.println(word + " -> " + posMap.get(word));
        }
    }

    /* ==============================
       Main Testing Driver
       ============================== */
    public static void main(String[] args) {

        String doc1 = "The cat sat on the mat. The cat is happy.";
        String doc2 = "The cat is happy and sat on the mat.";

        System.out.println("---- Word Frequency ----");
        HashMap<String, Integer> freq = wordFrequency(doc1);
        printFrequency(freq);

        System.out.println("\n---- Word Positions ----");
        HashMap<String, List<Integer>> positions = wordPositions(doc1);
        printPositions(positions);

        System.out.println("\n---- Top 3 Frequent Words ----");
        System.out.println(topKFrequent(freq, 3));

        System.out.println("\n---- Duplicate Check ----");
        System.out.println(areDocumentsDuplicate(doc1, doc2));

        System.out.println("\n---- Jaccard Similarity ----");
        System.out.println(jaccardSimilarity(doc1, doc2));
    }
}
