const AssistantStatus = {
    QUEUED : "queued",
    RUNNING : "running",
    REQUIRES_ACTION : "requires_action",
    CANCELLING : "cancelling",
    CANCELLED : "cancelled",
    FAILED : "failed",
    COMPLETED : "completed",
    EXPIRED : "expired",
}

export async function waitForRunCompletion(openai, threadId, runId) {
    let status = AssistantStatus.QUEUED;

    while (true) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const run = await openai.beta.threads.runs.retrieve(threadId, runId);
        status = run.status;

        if (status === AssistantStatus.COMPLETED) {
            return AssistantStatus.COMPLETED;
        } else if (
            status === AssistantStatus.REQUIRES_ACTION ||
            status === AssistantStatus.FAILED ||
            status === AssistantStatus.CANCELLED ||
            status === AssistantStatus.EXPIRED
        ) {
            return AssistantStatus.FAILED;
        }
    }
}