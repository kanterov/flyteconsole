import { FetchableData } from 'components/hooks';
import { useFetchableData } from 'components/hooks/useFetchableData';
import { isEqual } from 'lodash';
import {
    Execution,
    NodeExecution,
    RequestConfig,
    TaskExecutionIdentifier,
    WorkflowExecutionIdentifier
} from 'models';
import { useContext } from 'react';
import { ExecutionContext, ExecutionDataCacheContext } from './contexts';
import { formatRetryAttempt } from './TaskExecutionsList/utils';
import { ExecutionDataCache, NodeExecutionGroup } from './types';

interface FetchGroupForTaskExecutionArgs {
    config: RequestConfig;
    dataCache: ExecutionDataCache;
    taskExecutionId: TaskExecutionIdentifier;
}
async function fetchGroupForTaskExecution({
    dataCache,
    config,
    taskExecutionId
}: FetchGroupForTaskExecutionArgs): Promise<NodeExecutionGroup> {
    return {
        // NodeExecutions created by a TaskExecution are grouped
        // by the retry attempt of the task.
        name: formatRetryAttempt(taskExecutionId.retryAttempt),
        nodeExecutions: await dataCache.getTaskExecutionChildren(
            taskExecutionId,
            config
        )
    };
}

interface FetchGroupForWorkflowExecutionArgs {
    config: RequestConfig;
    dataCache: ExecutionDataCache;
    workflowExecutionId: WorkflowExecutionIdentifier;
}
async function fetchGroupForWorkflowExecution({
    config,
    dataCache,
    workflowExecutionId
}: FetchGroupForWorkflowExecutionArgs): Promise<NodeExecutionGroup> {
    return {
        // NodeExecutions created by a workflow execution are grouped
        // by the execution id, since workflow executions are not retryable.
        name: workflowExecutionId.name,
        nodeExecutions: await dataCache.getNodeExecutions(
            workflowExecutionId,
            config
        )
    };
}

interface FetchNodeExecutionGroupArgs {
    config: RequestConfig;
    dataCache: ExecutionDataCache;
    nodeExecution: NodeExecution;
}

async function fetchGroupsForTaskExecutionNode({
    config,
    dataCache,
    nodeExecution: { id: nodeExecutionId }
}: FetchNodeExecutionGroupArgs): Promise<NodeExecutionGroup[]> {
    const taskExecutions = await dataCache.getTaskExecutions(nodeExecutionId);

    // For TaskExecutions marked as parents, fetch its children and create a group.
    // Otherwise, return null and we will filter it out later.
    const groups = await Promise.all(
        taskExecutions.map(execution =>
            execution.isParent
                ? fetchGroupForTaskExecution({
                      dataCache,
                      config,
                      taskExecutionId: execution.id
                  })
                : Promise.resolve(null)
        )
    );

    // Remove any empty groups
    return groups.filter(
        group => group !== null && group.nodeExecutions.length > 0
    ) as NodeExecutionGroup[];
}

async function fetchGroupsForWorkflowExecutionNode({
    config,
    dataCache,
    nodeExecution
}: FetchNodeExecutionGroupArgs): Promise<NodeExecutionGroup[]> {
    if (!nodeExecution.closure.workflowNodeMetadata) {
        throw new Error('Unexpected empty `workflowNodeMetadata`');
    }
    const {
        executionId: workflowExecutionId
    } = nodeExecution.closure.workflowNodeMetadata;
    // We can only have one WorkflowExecution (no retries), so there is only
    // one group to return. But calling code expects it as an array.
    const group = await fetchGroupForWorkflowExecution({
        dataCache,
        config,
        workflowExecutionId
    });
    return group.nodeExecutions.length > 0 ? [group] : [];
}

export interface UseChildNodeExecutionsArgs {
    requestConfig: RequestConfig;
    nodeExecution: NodeExecution;
    workflowExecution: Execution;
}

/** Fetches and groups `NodeExecution`s which are direct children of the given
 * `NodeExecution`.
 */
export function useChildNodeExecutions({
    nodeExecution,
    requestConfig
}: UseChildNodeExecutionsArgs): FetchableData<NodeExecutionGroup[]> {
    const { execution: topExecution } = useContext(ExecutionContext);
    const dataCache = useContext(ExecutionDataCacheContext);
    const { workflowNodeMetadata } = nodeExecution.closure;
    return useFetchableData<NodeExecutionGroup[], NodeExecution>(
        {
            debugName: 'ChildNodeExecutions',
            defaultValue: [],
            doFetch: async data => {
                const fetchArgs = {
                    dataCache,
                    config: requestConfig,
                    nodeExecution: data
                };

                // Nested NodeExecutions will sometimes have `workflowNodeMetadata` that
                // points to the parent WorkflowExecution. We're only interested in
                // showing children if this node is a sub-workflow.
                if (
                    workflowNodeMetadata &&
                    !isEqual(workflowNodeMetadata.executionId, topExecution.id)
                ) {
                    return fetchGroupsForWorkflowExecutionNode(fetchArgs);
                }
                return fetchGroupsForTaskExecutionNode(fetchArgs);
            }
        },
        nodeExecution
    );
}
