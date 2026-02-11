import java.util.Arrays;
import java.util.Comparator;

class Job {
    int start;
    int finish;
    int profit;

    public Job(int start, int finish, int profit) {
        this.start = start;
        this.finish = finish;
        this.profit = profit;
    }
}

public class WeightedIntervalScheduling {

    // Binary search to find the latest job (before current)
    // that doesn't conflict
    static int findLastNonConflicting(Job[] jobs, int index) {
        int low = 0;
        int high = index - 1;

        while (low <= high) {
            int mid = (low + high) / 2;

            if (jobs[mid].finish <= jobs[index].start) {
                if (jobs[mid + 1].finish <= jobs[index].start)
                    low = mid + 1;
                else
                    return mid;
            } else {
                high = mid - 1;
            }
        }
        return -1;
    }

    // Dynamic Programming Solution
    static int maxProfit(Job[] jobs) {

        // Step 1: Sort jobs by finish time
        Arrays.sort(jobs, Comparator.comparingInt(j -> j.finish));

        int n = jobs.length;
        int[] dp = new int[n];

        // Base case
        dp[0] = jobs[0].profit;

        for (int i = 1; i < n; i++) {

            // Include current job
            int includeProfit = jobs[i].profit;

            int lastNonConflict = findLastNonConflicting(jobs, i);
            if (lastNonConflict != -1) {
                includeProfit += dp[lastNonConflict];
            }

            // Exclude current job
            int excludeProfit = dp[i - 1];

            // Store best result
            dp[i] = Math.max(includeProfit, excludeProfit);
        }

        return dp[n - 1];
    }

    public static void main(String[] args) {

        Job[] jobs = {
            new Job(1, 3, 50),
            new Job(2, 5, 20),
            new Job(4, 6, 70),
            new Job(6, 7, 60),
            new Job(5, 8, 30),
            new Job(7, 9, 40)
        };

        int result = maxProfit(jobs);
        System.out.println("Maximum Profit: " + result);
    }
}
